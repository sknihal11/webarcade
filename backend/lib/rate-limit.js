import { admin, firestore } from "./firebase-admin.js";
import { hashValue } from "./helpers.js";

async function consumeRateLimit(namespace, key, windowMs, maxAttempts, metadata = {}) {
  const now = Date.now();
  const keyHash = hashValue(key);
  const ref = firestore.collection("api_rate_limits").doc(`${namespace}_${keyHash}`);

  return firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists ? snapshot.data() : null;
    const windowStartedAt = existing?.windowStartedAt?.toMillis?.() || existing?.windowStartedAt || 0;
    const windowIsActive = windowStartedAt && now - Number(windowStartedAt) < windowMs;
    const count = windowIsActive ? Number(existing?.count || 0) + 1 : 1;

    transaction.set(ref, {
      ...metadata,
      count,
      keyHash,
      lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
      windowStartedAt: new Date(windowIsActive ? Number(windowStartedAt) : now)
    }, { merge: true });

    return {
      blocked: count > maxAttempts,
      count
    };
  });
}

export {
  consumeRateLimit
};
