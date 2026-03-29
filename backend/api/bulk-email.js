import { ADMIN_REQUEST_MAX, ADMIN_REQUEST_WINDOW_MS } from "../lib/config.js";
import { admin } from "../lib/firebase-admin.js";
import { requireAdmin } from "../lib/auth.js";
import {
  createCampaignLog,
  listMailRecipients,
  markCampaignFailure,
  runBulkCampaign
} from "../lib/campaigns.js";
import { ApiError, hashValue, normalizeMailPayload } from "../lib/helpers.js";
import { runApiRoute, readJsonBody, requireMethod, sendJson } from "../lib/http.js";
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

    const recipients = await listMailRecipients({
      includeUnverified: payload.includeUnverified
    });

    const campaignRef = await createCampaignLog({
      adminUser,
      audience: payload.includeUnverified ? "all-users" : "verified-users",
      dryRun: payload.dryRun,
      htmlMessage: payload.htmlMessage,
      includeUnverified: payload.includeUnverified,
      mode: payload.dryRun ? "dry-run" : "broadcast",
      subject: payload.subject,
      testEmail: null,
      textMessage: payload.textMessage,
      totalRecipients: recipients.length
    });

    if (payload.dryRun) {
      await campaignRef.set({
        sampleRecipients: recipients.slice(0, 10).map(user => user.email),
        status: "dry-run-complete",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      sendJson(res, 200, {
        ok: true,
        campaignId: campaignRef.id,
        totalRecipients: recipients.length,
        message: recipients.length
          ? `Dry run complete. ${recipients.length} recipient(s) match the current audience.`
          : "Dry run complete. No recipients matched the current audience."
      });
      return;
    }

    try {
      const result = await runBulkCampaign({
        campaignRef,
        htmlMessage: payload.htmlMessage,
        recipients,
        subject: payload.subject,
        textMessage: payload.textMessage
      });

      sendJson(res, 200, {
        ok: true,
        campaignId: campaignRef.id,
        ...result
      });
    } catch (error) {
      await markCampaignFailure(campaignRef, error);
      throw new ApiError(500, "internal", "The bulk email request could not be completed.");
    }
  });
}
