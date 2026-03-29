import { ADMIN_EMAILS } from "./config.js";
import { auth } from "./firebase-admin.js";
import { ApiError, extractBearerToken, normalizeEmail } from "./helpers.js";

async function requireAdmin(req) {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    throw new ApiError(401, "unauthenticated", "You must be signed in.");
  }

  let decodedToken;
  try {
    decodedToken = await auth.verifyIdToken(token, true);
  } catch {
    throw new ApiError(401, "unauthenticated", "You must be signed in.");
  }

  const email = normalizeEmail(decodedToken.email);

  if (!decodedToken.email_verified) {
    throw new ApiError(403, "permission-denied", "Verify your email before using the admin mail system.");
  }

  if (!email || !ADMIN_EMAILS.has(email)) {
    throw new ApiError(403, "permission-denied", "You are not allowed to use this admin endpoint.");
  }

  return {
    email,
    uid: decodedToken.uid
  };
}

export {
  requireAdmin
};
