import { auth, firestore } from "../lib/firebase-admin.js";
import { normalizeEmail } from "../lib/helpers.js";
import { readJsonBody, requireMethod, runApiRoute, sendJson } from "../lib/http.js";

function normalizeUsernameIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidUsernameIdentifier(value) {
  return /^[a-z0-9_]{3,20}$/i.test(value);
}

export default async function handler(req, res) {
  await runApiRoute(req, res, async () => {
    requireMethod(req, "POST");

    const body = await readJsonBody(req);
    const rawIdentifier = String(body?.identifier || "").trim();
    const normalizedIdentifier = normalizeUsernameIdentifier(rawIdentifier);

    let loginEmail = "";

    if (normalizedIdentifier.includes("@")) {
      loginEmail = normalizeEmail(normalizedIdentifier);
    } else if (isValidUsernameIdentifier(normalizedIdentifier)) {
      const usernameDoc = await firestore.collection("usernames").doc(normalizedIdentifier).get();
      const uid = usernameDoc.exists ? String(usernameDoc.data()?.uid || "") : "";

      if (uid) {
        const userRecord = await auth.getUser(uid).catch(() => null);
        loginEmail = normalizeEmail(userRecord?.email || "");
      }
    }

    sendJson(res, 200, {
      ok: true,
      loginEmail
    });
  });
}
