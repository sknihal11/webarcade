import { ADMIN_REQUEST_MAX, ADMIN_REQUEST_WINDOW_MS } from "../lib/config.js";
import { admin } from "../lib/firebase-admin.js";
import { requireAdmin } from "../lib/auth.js";
import { createCampaignLog } from "../lib/campaigns.js";
import {
  ApiError,
  hashValue,
  isValidGmail,
  normalizeMailPayload,
  readableErrorMessage,
  sanitizeErrorForLogs
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
    if (!isValidGmail(payload.testEmail)) {
      throw new ApiError(400, "invalid-argument", "Enter a valid Gmail address for test delivery.");
    }

    const campaignRef = await createCampaignLog({
      adminUser,
      audience: "single-test-email",
      dryRun: false,
      htmlMessage: payload.htmlMessage,
      includeUnverified: false,
      mode: "test",
      subject: payload.subject,
      testEmail: payload.testEmail,
      textMessage: payload.textMessage,
      totalRecipients: 1
    });

    try {
      const mail = buildAnnouncementEmail({
        htmlMessage: payload.htmlMessage,
        subject: payload.subject,
        testLabel: "Test Email",
        textMessage: payload.textMessage
      });

      await sendEmail({
        to: payload.testEmail,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        headers: {
          "X-WebArcade-Campaign-ID": campaignRef.id
        }
      }, {
        idempotencyKey: `test-email/${campaignRef.id}/${payload.testEmail}`
      });

      await campaignRef.set({
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedCount: 1,
        sentCount: 1,
        status: "test-sent",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      sendJson(res, 200, {
        ok: true,
        campaignId: campaignRef.id,
        message: "Test email sent successfully."
      });
    } catch (error) {
      await campaignRef.set({
        failedCount: 1,
        failures: [{
          email: payload.testEmail,
          code: error?.code || "internal",
          error: readableErrorMessage(error)
        }],
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedCount: 1,
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
