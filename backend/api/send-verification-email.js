import {
  APP_URL,
  VERIFICATION_EMAIL_RATE_LIMIT_MAX,
  VERIFICATION_EMAIL_RATE_LIMIT_WINDOW_MS
} from "../lib/config.js";
import { requireAuthenticatedUser } from "../lib/auth.js";
import { admin, auth, firestore } from "../lib/firebase-admin.js";
import {
  ApiError,
  hashValue,
  normalizeEmail,
  sanitizeErrorForLogs,
  sanitizeNextPath
} from "../lib/helpers.js";
import { runApiRoute, readJsonBody, requireMethod, sendJson } from "../lib/http.js";
import { buildVerificationEmail, sendEmail } from "../lib/mail.js";
import { consumeRateLimit } from "../lib/rate-limit.js";

export default async function handler(req, res) {
  await runApiRoute(req, res, async () => {
    requireMethod(req, "POST");

    const signedInUser = await requireAuthenticatedUser(req);
    const body = await readJsonBody(req);
    const requestedEmail = normalizeEmail(body?.email);
    const nextPath = sanitizeNextPath(body?.nextPath, "/games/");
    const userRecord = await auth.getUser(signedInUser.uid).catch(() => null);

    if (!userRecord?.email) {
      throw new ApiError(401, "unauthenticated", "You must be signed in.");
    }

    const accountEmail = normalizeEmail(userRecord.email);
    if (requestedEmail && requestedEmail !== accountEmail) {
      throw new ApiError(403, "permission-denied", "You can only request verification for your own account.");
    }

    if (userRecord.emailVerified) {
      sendJson(res, 200, {
        ok: true,
        alreadyVerified: true,
        message: "This account is already verified."
      });
      return;
    }

    const rateLimitState = await consumeRateLimit(
      "verification_email",
      signedInUser.uid,
      VERIFICATION_EMAIL_RATE_LIMIT_WINDOW_MS,
      VERIFICATION_EMAIL_RATE_LIMIT_MAX,
      {
        emailHash: hashValue(accountEmail),
        uid: signedInUser.uid
      }
    );

    if (rateLimitState.blocked) {
      throw new ApiError(429, "rate-limit", "Please wait before requesting another verification email.");
    }

    try {
      const continueUrl = new URL(
        `/login/?verified=1&next=${encodeURIComponent(nextPath)}`,
        `${APP_URL}/`
      ).toString();

      const verificationLink = await auth.generateEmailVerificationLink(accountEmail, {
        url: continueUrl,
        handleCodeInApp: false
      });

      const mail = buildVerificationEmail(verificationLink);
      await sendEmail({
        to: accountEmail,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        headers: {
          "X-WebArcade-Template": "email-verification"
        }
      });

      await firestore.collection("users").doc(signedInUser.uid).set({
        verificationEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
        verificationStatus: "pending",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      console.info("Verification email sent", {
        emailHash: hashValue(accountEmail),
        nextPath,
        uid: signedInUser.uid
      });

      sendJson(res, 200, {
        ok: true,
        message: "Verification email sent. Check your inbox and spam folder."
      });
    } catch (error) {
      console.error("Verification email flow failed", sanitizeErrorForLogs(error, {
        emailHash: hashValue(accountEmail),
        nextPath,
        uid: signedInUser.uid
      }));

      throw new ApiError(500, "internal", "We could not send the verification email right now.");
    }
  });
}
