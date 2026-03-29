import { ADMIN_REQUEST_MAX, ADMIN_REQUEST_WINDOW_MS } from "../lib/config.js";
import { admin } from "../lib/firebase-admin.js";
import { requireAdmin } from "../lib/auth.js";
import { createCampaignLog } from "../lib/campaigns.js";
import {
  ApiError,
  cleanEmailList,
  hashValue,
  normalizeMailPayload,
  readableErrorMessage,
  sanitizeErrorForLogs,
  sleep
} from "../lib/helpers.js";
import { runApiRoute, readJsonBody, requireMethod, sendJson } from "../lib/http.js";
import { buildAnnouncementEmail, sendEmail } from "../lib/mail.js";
import { consumeRateLimit } from "../lib/rate-limit.js";

export default async function handler(req, res) {
  await runApiRoute(req, res, async () => {
    requireMethod(req, "POST");

    const adminUser = await requireAdmin(req);
    const body = await readJsonBody(req);
    const payload = normalizeMailPayload(body || {});

    const rateLimitState = await consumeRateLimit(
      "admin_email",
      adminUser.uid,
      ADMIN_REQUEST_WINDOW_MS,
      ADMIN_REQUEST_MAX,
      { adminHash: hashValue(adminUser.uid), email: adminUser.email }
    );

    if (rateLimitState.blocked) {
      throw new ApiError(429, "rate-limit", "Too many admin email requests. Please wait before trying again.");
    }

    if (!payload.subject) {
      throw new ApiError(400, "invalid-argument", "Subject is required.");
    }
    if (!payload.htmlMessage) {
      throw new ApiError(400, "invalid-argument", "HTML message is required.");
    }
    if (!payload.textMessage) {
      throw new ApiError(400, "invalid-argument", "Plain-text message is required.");
    }

    const cleanedRecipients = cleanEmailList(
      [...payload.testEmails, payload.testEmail],
      { gmailOnly: false }
    );

    if (!cleanedRecipients.emails.length) {
      throw new ApiError(400, "invalid-argument", "Enter at least one valid email address for test delivery.");
    }

    const campaignRef = await createCampaignLog({
      adminUser,
      audience: "test-email-list",
      audienceStats: {
        duplicatesRemovedCount: cleanedRecipients.duplicatesRemovedCount,
        rawAudienceCount: cleanedRecipients.rawCount,
        skippedInvalidEmailsCount: cleanedRecipients.skippedInvalidEmailsCount,
        skippedSuppressedEmailsCount: 0,
        uniqueRecipientsCount: cleanedRecipients.emails.length
      },
      dryRun: false,
      htmlMessage: payload.htmlMessage,
      includeUnverified: false,
      mode: "test",
      subject: payload.subject,
      testEmail: cleanedRecipients.emails[0] || null,
      testEmails: cleanedRecipients.emails,
      textMessage: payload.textMessage,
      totalRecipients: cleanedRecipients.emails.length
    });

    try {
      const mail = buildAnnouncementEmail({
        htmlMessage: payload.htmlMessage,
        subject: payload.subject,
        testLabel: "Test Email",
        textMessage: payload.textMessage
      });

      let processedCount = 0;
      let sentCount = 0;
      let failedCount = 0;
      const failures = [];

      for (let index = 0; index < cleanedRecipients.emails.length; index += 1) {
        const email = cleanedRecipients.emails[index];

        try {
          await sendEmail({
            to: email,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            headers: {
              "X-WebArcade-Campaign-ID": campaignRef.id
            }
          }, {
            idempotencyKey: `test-email/${campaignRef.id}/${email}`
          });

          sentCount += 1;
        } catch (error) {
          failedCount += 1;
          if (failures.length < 25) {
            failures.push({
              email,
              code: error?.code || "internal",
              error: readableErrorMessage(error)
            });
          }
        }

        processedCount += 1;

        await campaignRef.set({
          failedCount,
          failures,
          processedCount,
          sentCount,
          status: "sending",
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        if (index + 1 < cleanedRecipients.emails.length) {
          await sleep(350);
        }
      }

      const finalStatus = failedCount ? "test-failed" : "test-sent";

      await campaignRef.set({
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedCount,
        sentCount,
        failedCount,
        failures,
        status: finalStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      sendJson(res, 200, {
        ok: true,
        campaignId: campaignRef.id,
        message: failedCount
          ? `Test send finished with ${sentCount} sent and ${failedCount} failed recipient(s).`
          : `Test email sent to ${sentCount} recipient(s).`
      });
    } catch (error) {
      await campaignRef.set({
        failedCount: cleanedRecipients.emails.length || 1,
        failures: [{
          email: cleanedRecipients.emails[0] || null,
          code: error?.code || "internal",
          error: readableErrorMessage(error)
        }],
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedCount: cleanedRecipients.emails.length || 1,
        providerCode: error?.code || "internal",
        providerStatusCode: Number(error?.statusCode) || 500,
        status: "test-failed",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(() => {});

      console.error("Test email failed", sanitizeErrorForLogs(error, {
        campaignId: campaignRef.id
      }));

      const statusCode = Number(error?.statusCode);
      throw new ApiError(
        statusCode >= 400 && statusCode < 500 ? statusCode : 500,
        error?.code || "internal",
        readableErrorMessage(error) || "The test email could not be sent."
      );
    }
  });
}
