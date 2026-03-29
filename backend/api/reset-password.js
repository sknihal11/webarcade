import { PASSWORD_RESET_CONTINUE_URL, PASSWORD_RESET_RATE_LIMIT_MAX, PASSWORD_RESET_RATE_LIMIT_WINDOW_MS } from "../lib/config.js";
import { auth } from "../lib/firebase-admin.js";
import { ApiError, hashValue, isValidEmailAddress, normalizeEmail, sanitizeErrorForLogs } from "../lib/helpers.js";
import { runApiRoute, readJsonBody, requireMethod, sendJson } from "../lib/http.js";
import { buildResetEmail, sendEmail } from "../lib/mail.js";
import { consumeRateLimit } from "../lib/rate-limit.js";

export default async function handler(req, res) {
  await runApiRoute(req, res, async () => {
    requireMethod(req, "POST");

    const body = await readJsonBody(req);
    const email = normalizeEmail(body?.email);
    const genericResponse = {
      ok: true,
      message: "If this email address is registered, a password reset email is on the way."
    };

    if (!isValidEmailAddress(email)) {
      throw new ApiError(400, "invalid-argument", "Enter a valid email address.");
    }

    const rateLimitState = await consumeRateLimit(
      "password_reset",
      email,
      PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
      PASSWORD_RESET_RATE_LIMIT_MAX,
      { emailHash: hashValue(email) }
    );

    if (rateLimitState.blocked) {
      console.warn("Password reset rate limit hit", {
        count: rateLimitState.count,
        emailHash: hashValue(email)
      });
      sendJson(res, 200, genericResponse);
      return;
    }

    try {
      const resetLink = await auth.generatePasswordResetLink(email, {
        url: PASSWORD_RESET_CONTINUE_URL,
        handleCodeInApp: false
      });

      const mail = buildResetEmail(resetLink);
      await sendEmail({
        to: email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        headers: {
          "X-WebArcade-Template": "password-reset"
        }
      });

      console.info("Password reset email sent", {
        emailHash: hashValue(email)
      });
    } catch (error) {
      console.error("Password reset email flow failed", sanitizeErrorForLogs(error, {
        emailHash: hashValue(email)
      }));
    }

    sendJson(res, 200, genericResponse);
  });
}
