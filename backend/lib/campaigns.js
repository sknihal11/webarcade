import {
  BULK_EMAIL_BATCH_DELAY_MS,
  BULK_EMAIL_BATCH_SIZE
} from "./config.js";
import { admin, auth, firestore } from "./firebase-admin.js";
import {
  buildCampaignResultMessage,
  readableErrorMessage,
  sanitizeErrorForLogs,
  sleep
} from "./helpers.js";
import { buildAnnouncementEmail, sendEmail } from "./mail.js";

async function listMailRecipients({ includeUnverified }) {
  const recipients = [];
  let pageToken;

  do {
    const page = await auth.listUsers(1000, pageToken);

    page.users.forEach(userRecord => {
      const email = String(userRecord.email || "").trim().toLowerCase();
      if (!email || userRecord.disabled) return;
      if (!includeUnverified && !userRecord.emailVerified) return;

      recipients.push({
        email,
        emailVerified: Boolean(userRecord.emailVerified),
        uid: userRecord.uid
      });
    });

    pageToken = page.pageToken;
  } while (pageToken);

  return recipients;
}

async function createCampaignLog({
  adminUser,
  audience,
  dryRun,
  htmlMessage,
  includeUnverified,
  mode,
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
    status: "preparing",
    subject,
    testEmail: testEmail || null,
    textPreview: String(textMessage || "").slice(0, 5000),
    totalRecipients: Number(totalRecipients) || 0,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return campaignRef;
}

async function runBulkCampaign({ campaignRef, recipients, htmlMessage, subject, textMessage }) {
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

  for (let index = 0; index < recipients.length; index += BULK_EMAIL_BATCH_SIZE) {
    const batch = recipients.slice(index, index + BULK_EMAIL_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(recipient => {
        const mail = buildAnnouncementEmail({
          htmlMessage,
          subject,
          textMessage
        });

        return sendEmail({
          to: recipient.email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          headers: {
            "X-WebArcade-Campaign-ID": campaignRef.id
          }
        });
      })
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
    failedCount,
    sentCount,
    totalRecipients: recipients.length
  });

  return {
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
