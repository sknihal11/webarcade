import {
  BULK_EMAIL_BATCH_DELAY_MS,
  BULK_EMAIL_BATCH_SIZE
} from "./config.js";
import { admin, auth, firestore } from "./firebase-admin.js";
import {
  buildCampaignResultMessage,
  isValidEmailAddress,
  normalizeEmail,
  readableErrorMessage,
  sanitizeErrorForLogs,
  sleep
} from "./helpers.js";
import { buildAnnouncementEmail, sendEmail } from "./mail.js";

const BULK_EMAIL_RETRY_MAX_ATTEMPTS = 3;

async function listSuppressedEmails() {
  const suppressedEmails = new Set();

  try {
    const snapshot = await firestore.collection("mail_suppressions").get();
    snapshot.forEach(docSnap => {
      const data = docSnap.data() || {};
      if (data.active === false) return;

      const normalizedDocId = normalizeEmail(docSnap.id);
      const normalizedFieldEmail = normalizeEmail(data.email);
      const suppressedEmail = normalizedFieldEmail || normalizedDocId;

      if (suppressedEmail) {
        suppressedEmails.add(suppressedEmail);
      }
    });
  } catch (error) {
    console.warn("mail_suppressions lookup failed", sanitizeErrorForLogs(error));
  }

  return suppressedEmails;
}

async function listMailRecipients({ audienceType = "verified-users", specificEmail = "" }) {
  const rawRecipients = [];

  if (audienceType === "specific-user") {
    const email = normalizeEmail(specificEmail);

    if (email) {
      try {
        const userRecord = await auth.getUserByEmail(email);

        if (!userRecord.disabled) {
          rawRecipients.push({
            email: String(userRecord.email || ""),
            emailVerified: Boolean(userRecord.emailVerified),
            uid: userRecord.uid
          });
        }
      } catch (error) {
        if (error?.code !== "auth/user-not-found") {
          throw error;
        }
      }
    }
  } else {
    let pageToken;

    do {
      const page = await auth.listUsers(1000, pageToken);

      page.users.forEach(userRecord => {
        if (userRecord.disabled) return;
        if (audienceType === "verified-users" && !userRecord.emailVerified) return;
        if (audienceType === "unverified-users" && userRecord.emailVerified) return;

        rawRecipients.push({
          email: String(userRecord.email || ""),
          emailVerified: Boolean(userRecord.emailVerified),
          uid: userRecord.uid
        });
      });

      pageToken = page.pageToken;
    } while (pageToken);
  }

  const suppressedEmails = await listSuppressedEmails();
  const seenEmails = new Set();
  const recipients = [];

  let duplicatesRemovedCount = 0;
  let skippedInvalidEmailsCount = 0;
  let skippedSuppressedEmailsCount = 0;

  rawRecipients.forEach(recipient => {
    const email = normalizeEmail(recipient.email);

    if (!isValidEmailAddress(email)) {
      skippedInvalidEmailsCount += 1;
      return;
    }

    if (suppressedEmails.has(email)) {
      skippedSuppressedEmailsCount += 1;
      return;
    }

    if (seenEmails.has(email)) {
      duplicatesRemovedCount += 1;
      return;
    }

    seenEmails.add(email);
    recipients.push({
      ...recipient,
      email
    });
  });

  const audienceStats = {
    duplicatesRemovedCount,
    rawAudienceCount: rawRecipients.length,
    skippedInvalidEmailsCount,
    skippedSuppressedEmailsCount,
    uniqueRecipientsCount: recipients.length
  };

  console.info("Bulk email audience prepared", audienceStats);

  return {
    recipients,
    stats: audienceStats
  };
}

async function createCampaignLog({
  adminUser,
  audience,
  audienceStats,
  dryRun,
  htmlMessage,
  includeUnverified,
  mode,
  specificEmail,
  subject,
  testEmail,
  textMessage,
  totalRecipients
}) {
  const campaignRef = firestore.collection("mail_campaigns").doc();

  await campaignRef.set({
    audience,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: adminUser,
    dryRun,
    failedCount: 0,
    failures: [],
    htmlPreview: String(htmlMessage || "").slice(0, 5000),
    includeUnverified: Boolean(includeUnverified),
    mode,
    processedCount: 0,
    sentCount: 0,
    specificEmail: specificEmail || null,
    status: "preparing",
    subject,
    testEmail: testEmail || null,
    textPreview: String(textMessage || "").slice(0, 5000),
    totalRecipients: Number(totalRecipients) || 0,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  if (audienceStats) {
    await campaignRef.set({
      duplicatesRemovedCount: Number(audienceStats.duplicatesRemovedCount) || 0,
      rawAudienceCount: Number(audienceStats.rawAudienceCount) || 0,
      skippedInvalidEmailsCount: Number(audienceStats.skippedInvalidEmailsCount) || 0,
      skippedSuppressedEmailsCount: Number(audienceStats.skippedSuppressedEmailsCount) || 0,
      uniqueRecipientsCount: Number(audienceStats.uniqueRecipientsCount) || 0
    }, { merge: true });
  }

  return campaignRef;
}

function isTemporaryRateLimitError(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = readableErrorMessage(error).toLowerCase();
  const statusCode = Number(error?.statusCode || 0);

  return (
    statusCode === 429
    || code.includes("rate_limit")
    || code.includes("too_many_requests")
    || message.includes("too many requests")
    || message.includes("rate limit")
  );
}

async function sendCampaignRecipientEmail({ campaignId, htmlMessage, recipient, subject, textMessage }) {
  const mail = buildAnnouncementEmail({
    htmlMessage,
    subject,
    textMessage
  });

  let attempt = 0;

  while (attempt < BULK_EMAIL_RETRY_MAX_ATTEMPTS) {
    try {
      return await sendEmail({
        to: recipient.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        headers: {
          "X-WebArcade-Campaign-ID": campaignId
        }
      }, {
        idempotencyKey: `bulk-campaign/${campaignId}/${recipient.uid || recipient.email}`
      });
    } catch (error) {
      attempt += 1;

      if (!isTemporaryRateLimitError(error) || attempt >= BULK_EMAIL_RETRY_MAX_ATTEMPTS) {
        throw error;
      }

      const retryDelayMs = BULK_EMAIL_BATCH_DELAY_MS * attempt;
      console.warn("Bulk email retry scheduled after provider rate limit", {
        attempt,
        campaignId,
        email: recipient.email,
        retryDelayMs
      });
      await sleep(retryDelayMs);
    }
  }

  throw new Error("Bulk email retry loop exited unexpectedly.");
}

async function runBulkCampaign({ campaignRef, recipients, htmlMessage, subject, textMessage, audienceStats = null }) {
  let sentCount = 0;
  let failedCount = 0;
  let processedCount = 0;
  const failures = [];

  await campaignRef.set({
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
    status: "sending",
    totalRecipients: recipients.length,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  if (audienceStats) {
    await campaignRef.set({
      duplicatesRemovedCount: Number(audienceStats.duplicatesRemovedCount) || 0,
      rawAudienceCount: Number(audienceStats.rawAudienceCount) || 0,
      skippedInvalidEmailsCount: Number(audienceStats.skippedInvalidEmailsCount) || 0,
      skippedSuppressedEmailsCount: Number(audienceStats.skippedSuppressedEmailsCount) || 0,
      uniqueRecipientsCount: Number(audienceStats.uniqueRecipientsCount) || recipients.length
    }, { merge: true });
  }

  for (let index = 0; index < recipients.length; index += BULK_EMAIL_BATCH_SIZE) {
    const batch = recipients.slice(index, index + BULK_EMAIL_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(recipient => sendCampaignRecipientEmail({
        campaignId: campaignRef.id,
        htmlMessage,
        recipient,
        subject,
        textMessage
      }))
    );

    results.forEach((result, batchIndex) => {
      processedCount += 1;

      if (result.status === "fulfilled") {
        sentCount += 1;
        return;
      }

      failedCount += 1;
      if (failures.length < 25) {
        failures.push({
          code: result.reason?.code || "internal",
          email: batch[batchIndex].email,
          error: readableErrorMessage(result.reason)
        });
      }
    });

    await campaignRef.set({
      failedCount,
      failures,
      processedCount,
      sentCount,
      status: "sending",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    if (index + BULK_EMAIL_BATCH_SIZE < recipients.length && BULK_EMAIL_BATCH_DELAY_MS > 0) {
      await sleep(BULK_EMAIL_BATCH_DELAY_MS);
    }
  }

  const finalStatus = failedCount ? "completed-with-errors" : "completed";

  await campaignRef.set({
    failedCount,
    failures,
    finishedAt: admin.firestore.FieldValue.serverTimestamp(),
    processedCount,
    sentCount,
    status: finalStatus,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  console.info("Bulk email campaign completed", {
    campaignId: campaignRef.id,
    duplicatesRemovedCount: Number(audienceStats?.duplicatesRemovedCount) || 0,
    failedCount,
    rawAudienceCount: Number(audienceStats?.rawAudienceCount) || recipients.length,
    sentCount,
    skippedInvalidEmailsCount: Number(audienceStats?.skippedInvalidEmailsCount) || 0,
    skippedSuppressedEmailsCount: Number(audienceStats?.skippedSuppressedEmailsCount) || 0,
    totalRecipients: recipients.length
  });

  return {
    audienceStats: audienceStats || {
      duplicatesRemovedCount: 0,
      rawAudienceCount: recipients.length,
      skippedInvalidEmailsCount: 0,
      skippedSuppressedEmailsCount: 0,
      uniqueRecipientsCount: recipients.length
    },
    failedCount,
    sentCount,
    totalRecipients: recipients.length,
    message: buildCampaignResultMessage({
      failedCount,
      sentCount,
      totalRecipients: recipients.length
    })
  };
}

async function markCampaignFailure(campaignRef, error) {
  await campaignRef.set({
    errorMessage: readableErrorMessage(error),
    finishedAt: admin.firestore.FieldValue.serverTimestamp(),
    status: "failed",
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).catch(() => {});

  console.error("Bulk email campaign failed", sanitizeErrorForLogs(error, {
    campaignId: campaignRef.id
  }));
}

export {
  createCampaignLog,
  listMailRecipients,
  markCampaignFailure,
  runBulkCampaign
};
