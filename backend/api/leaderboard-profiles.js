import { firestore } from "../lib/firebase-admin.js";
import { runApiRoute, requireMethod, sendJson } from "../lib/http.js";

function sanitizeUsername(value, fallback = "Player") {
  const text = String(value || "").trim();
  return text || fallback;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateGlobalRating(best2048 = 0, bestFlappy = 0) {
  return (toNumber(best2048) || 0) * 0.01 + (toNumber(bestFlappy) || 0) * 0.1;
}

function buildLeaderboardProfile(docSnap) {
  const data = docSnap.data() || {};
  const best2048 = toNumber(data.best2048);
  const bestFlappy = toNumber(data.bestFlappy);

  return {
    id: docSnap.id,
    name: sanitizeUsername(data.username || data.displayName),
    avatar: String(data.photoURL || ""),
    score2048: best2048,
    scoreFlappy: bestFlappy,
    streak: toNumber(data.streak),
    globalRating: toNumber(data.globalRating) || calculateGlobalRating(best2048, bestFlappy),
    verificationStatus: data.verificationStatus === "verified" ? "verified" : "unverified"
  };
}

export default async function handler(req, res) {
  await runApiRoute(req, res, async () => {
    requireMethod(req, "GET");

    const limitValue = Math.min(
      Math.max(Number(req.query?.limit || 200) || 200, 1),
      1000
    );

    const snapshot = await firestore.collection("users").limit(limitValue).get();
    const profiles = snapshot.docs.map(buildLeaderboardProfile);

    sendJson(res, 200, {
      ok: true,
      profiles
    });
  });
}
