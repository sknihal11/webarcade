import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  getAuth,
  getIdToken,
  onAuthStateChanged,
  reauthenticateWithCredential,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
  verifyBeforeUpdateEmail
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import {
  get as getDatabaseValue,
  getDatabase,
  ref as databaseRef
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js";

export const ADMIN_EMAILS = ["support@webarcade.in", "nihalsk2022@gmail.com"];
export const DEFAULT_AVATAR_URL = "https://i.imgur.com/8Km9tLL.png";
export const AUTH_EMAIL_POLICY = {
  gmailOnly: true,
  allowedDomain: "gmail.com"
};
export const UNVERIFIED_ACCOUNT_GRACE_HOURS = 48;
export const EMAIL_VALIDATION_LIMITATION =
  "Format checks can reject obvious mistakes, but only email verification proves the mailbox can actually receive mail.";

export const firebaseConfig = {
  apiKey: "AIzaSyCzomf89xZhgcPsfYXKsYspCt-CiUVzjBA",
  authDomain: "webarcade-d4c3d.firebaseapp.com",
  databaseURL: "https://webarcade-d4c3d-default-rtdb.firebaseio.com",
  projectId: "webarcade-d4c3d",
  storageBucket: "webarcade-d4c3d.firebasestorage.app",
  messagingSenderId: "918209461327",
  appId: "1:918209461327:web:bd9c1a2431f9b5c66ffe3a"
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const API_BASE_URL = resolveApiBaseUrl();

let persistencePromise;
let persistenceMode = "local";

export function ensureBrowserPersistence() {
  return setAuthPersistence("local");
}

export function setAuthPersistence(mode = "local") {
  const resolvedMode = mode === "session" ? "session" : "local";
  const persistence = resolvedMode === "session" ? browserSessionPersistence : browserLocalPersistence;

  if (persistencePromise && persistenceMode === resolvedMode) {
    return persistencePromise;
  }

  persistenceMode = resolvedMode;

  if (!persistencePromise) {
    persistencePromise = Promise.resolve();
  }

  persistencePromise = persistencePromise
    .then(() => setPersistence(auth, persistence))
    .catch(error => {
      console.warn("Auth persistence setup failed:", error);
    });

  return persistencePromise;
}

export function isAdminEmail(email) {
  return Boolean(email) && ADMIN_EMAILS.includes(email.toLowerCase());
}

function resolveApiBaseUrl() {
  if (typeof window !== "undefined" && window.WEBARCADE_API_BASE_URL) {
    return String(window.WEBARCADE_API_BASE_URL).replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    const { hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost:3000";
    }
  }

  return "https://api.webarcade.in";
}

function createVerificationDeadline() {
  return new Date(Date.now() + UNVERIFIED_ACCOUNT_GRACE_HOURS * 60 * 60 * 1000);
}

function getPasswordBlacklist() {
  return new Set([
    "12345678",
    "123456789",
    "1234567890",
    "password",
    "password1",
    "password123",
    "qwerty123",
    "letmein123",
    "admin123",
    "welcome123"
  ]);
}

function buildUserAuthStateFields(user, previousData = {}) {
  const verified = Boolean(user?.emailVerified);
  const authProviders = Array.isArray(user?.providerData)
    ? user.providerData.map(provider => provider?.providerId).filter(Boolean)
    : [];

  return {
    email: user?.email || previousData.email || "",
    emailVerified: verified,
    verificationStatus: verified ? "verified" : "pending",
    verificationDeadlineAt: verified ? null : previousData.verificationDeadlineAt || createVerificationDeadline(),
    verifiedAt: verified ? previousData.verifiedAt || new Date() : null,
    authProviders: authProviders.length ? authProviders : previousData.authProviders || ["password"],
    lastAuthSyncAt: new Date()
  };
}

function sanitizeUsernameFragment(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
}

function buildFallbackUsername(user) {
  const fromDisplayName = sanitizeUsernameFragment(user?.displayName);
  if (fromDisplayName.length >= 3) return fromDisplayName;

  const fromEmail = sanitizeUsernameFragment(user?.email?.split("@")[0]);
  if (fromEmail.length >= 3) return fromEmail;

  const suffix = sanitizeUsernameFragment(user?.uid).slice(0, 8) || Math.random().toString(36).slice(2, 10);
  return `player_${suffix}`.slice(0, 20);
}

export function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function sanitizeNextPath(nextPath, fallback = "/games/") {
  const rawValue = String(nextPath || "").trim();
  if (!rawValue) return fallback;

  const cleanedNext = `/${rawValue.replace(/^\/+/, "")}`;
  if (
    cleanedNext.includes("..") ||
    /^https?:/i.test(rawValue) ||
    rawValue.startsWith("//") ||
    /^\/(?:login|signup|verify-email)\/?(?:$|\?)/i.test(cleanedNext) ||
    /^\/(?:login|signup|verify-email)\.html(?:$|\?)/i.test(cleanedNext)
  ) {
    return fallback;
  }

  return cleanedNext;
}

export function buildLoginRedirect(nextPath = "/games/", loginPath = "/login/") {
  const safeNext = sanitizeNextPath(nextPath);
  return `${loginPath}?next=${encodeURIComponent(safeNext)}`;
}

export function buildVerificationRedirect(nextPath = "/games/", verifyPath = "/verify-email/") {
  const safeNext = sanitizeNextPath(nextPath);
  return `${verifyPath}?next=${encodeURIComponent(safeNext)}`;
}

export function getDeviceId() {
  let id = localStorage.getItem("deviceId");

  if (!id) {
    id = `device_${Date.now()}_${Math.random().toString(36).slice(2, 15)}`;
    localStorage.setItem("deviceId", id);
  }

  return id;
}

export async function getServerTimeOffset(timeoutMs = 2500) {
  try {
    const offsetSnapshot = await Promise.race([
      getDatabaseValue(databaseRef(rtdb, ".info/serverTimeOffset")),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("server-timeout")), timeoutMs);
      })
    ]);

    return Number(offsetSnapshot.val()) || 0;
  } catch {
    return 0;
  }
}

export function calculateGlobalRating(best2048 = 0, bestFlappy = 0) {
  return (Number(best2048) || 0) * 0.01 + (Number(bestFlappy) || 0) * 0.1;
}

export async function checkPasswordBreach(password) {
  try {
    const hashBuffer = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password));
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();

    const prefix = hashHex.slice(0, 5);
    const suffix = hashHex.slice(5);
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    const lines = (await response.text()).split("\n");

    for (const line of lines) {
      const [hashSuffix, count] = line.split(":");
      if (hashSuffix === suffix) return parseInt(count, 10);
    }

    return 0;
  } catch {
    return 0;
  }
}

export function validateUsername(username) {
  if (!username || username.length < 3) return "Username must be at least 3 characters";
  if (username.length > 20) return "Username must be 20 characters or less";
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return "Username can only contain letters, numbers, and underscores";
  return null;
}

export function validateEmail(email, options = {}) {
  const gmailOnly = options.gmailOnly ?? AUTH_EMAIL_POLICY.gmailOnly;
  const rawEmail = String(email || "");

  if (!rawEmail.trim()) return "Email is required";
  if (rawEmail !== rawEmail.trim()) return "Email cannot start or end with spaces";
  if (/\s/.test(rawEmail)) return "Email cannot contain spaces";

  const normalizedEmail = normalizeEmail(rawEmail);
  if (normalizedEmail.length > 254) return "Email is too long";

  const parts = normalizedEmail.split("@");
  if (parts.length !== 2) return "Enter a valid email address";

  const [localPart, domain] = parts;
  if (!localPart || !domain) return "Enter a valid email address";
  if (localPart.length > 64) return "Enter a valid email address";
  if (localPart.startsWith(".") || localPart.endsWith(".") || localPart.includes("..")) {
    return "Enter a valid email address";
  }
  if (!/^[a-z0-9._%+-]+$/i.test(localPart)) return "Enter a valid email address";
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain)) return "Enter a valid email address";

  if (gmailOnly && domain !== AUTH_EMAIL_POLICY.allowedDomain) {
    return "Use a valid Gmail address ending in @gmail.com";
  }

  if (!gmailOnly) {
    const blockedDomains = [
      "test.com",
      "fake.com",
      "example.com",
      "tempmail.com",
      "10minutemail.com",
      "guerrillamail.com",
      "mailinator.com",
      "throwaway.email",
      "temp-mail.org",
      "fakeinbox.com",
      "yopmail.com"
    ];

    if (blockedDomains.includes(domain)) return "Please use a real email address";
  }

  return null;
}

export function isAllowedEmailAddress(email, options = {}) {
  return !validateEmail(email, options);
}

export function isAllowedGmailAddress(email) {
  return !validateEmail(email, { gmailOnly: true });
}

export function getPasswordRuleState(password) {
  const value = String(password || "");
  return {
    minLength: value.length >= 10,
    hasLower: /[a-z]/.test(value),
    hasUpper: /[A-Z]/.test(value),
    hasNumber: /\d/.test(value),
    hasSymbol: /[^a-zA-Z0-9]/.test(value)
  };
}

export function validatePassword(password, options = {}) {
  const value = String(password || "");
  const username = String(options.username || "").trim().toLowerCase();
  const email = normalizeEmail(options.email || "");
  const rules = getPasswordRuleState(value);
  const blacklist = getPasswordBlacklist();

  if (!value) return "Password is required";
  if (!rules.minLength) return "Password must be at least 10 characters";
  if (!rules.hasLower || !rules.hasUpper) return "Password must include both uppercase and lowercase letters";
  if (!rules.hasNumber) return "Password must include at least one number";
  if (blacklist.has(value.toLowerCase())) return "Choose a password that is harder to guess";

  if (username && value.toLowerCase().includes(username)) {
    return "Password should not contain your username";
  }

  const localPart = email.split("@")[0];
  if (localPart && value.toLowerCase().includes(localPart)) {
    return "Password should not contain your email name";
  }

  return null;
}

export function calculatePasswordStrength(password) {
  const rules = getPasswordRuleState(password);
  let strength = 0;

  if (rules.minLength) strength++;
  if (password.length >= 12) strength++;
  if (rules.hasLower && rules.hasUpper) strength++;
  if (rules.hasNumber) strength++;
  if (rules.hasSymbol) strength++;

  return strength;
}

export async function isUsernameTaken(username, currentUserId = null) {
  const usernameLower = normalizeUsername(username);
  if (!usernameLower) return false;

  const snap = await getDoc(doc(db, "usernames", usernameLower));
  if (!snap.exists()) return false;

  return snap.data().uid !== currentUserId;
}

export async function reserveUsername(userId, username) {
  const usernameText = String(username || "").trim();
  const usernameLower = normalizeUsername(usernameText);
  if (!usernameLower) throw new Error("Username is required");

  const ref = doc(db, "usernames", usernameLower);
  const snap = await getDoc(ref);

  if (snap.exists() && snap.data().uid !== userId) {
    throw new Error("Username taken");
  }

  await setDoc(ref, {
    uid: userId,
    username: usernameText,
    usernameLower,
    updatedAt: new Date()
  });
}

export async function releaseUsername(username, userId = null) {
  const usernameLower = normalizeUsername(username);
  if (!usernameLower) return;

  const ref = doc(db, "usernames", usernameLower);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  if (!userId || snap.data().uid === userId) {
    await deleteDoc(ref);
  }
}

export async function syncUsernameReservation(userId, username) {
  const usernameLower = normalizeUsername(username);
  if (!usernameLower) return;

  const ref = doc(db, "usernames", usernameLower);
  const snap = await getDoc(ref);

  if (!snap.exists() || snap.data().uid === userId) {
    await setDoc(ref, {
      uid: userId,
      username: String(username).trim(),
      usernameLower,
      updatedAt: new Date()
    });
  }
}

export async function checkEmailExists(email) {
  const validationError = validateEmail(email);
  if (validationError) return false;

  const normalizedEmail = normalizeEmail(email);
  const domain = normalizedEmail.split("@")[1];
  if (!domain) return false;

  if (AUTH_EMAIL_POLICY.gmailOnly && domain === AUTH_EMAIL_POLICY.allowedDomain) {
    return true;
  }

  try {
    const mxResponse = await fetch(`https://dns.google/resolve?name=${domain}&type=MX`);
    const mxData = await mxResponse.json();
    if (mxData.Answer?.length) return true;

    const aResponse = await fetch(`https://dns.google/resolve?name=${domain}&type=A`);
    const aData = await aResponse.json();
    return (aData.Answer?.length || 0) > 0;
  } catch {
    return true;
  }
}

function buildUserProfileData(user, deviceId, username, extraFields = {}) {
  const resolvedUsername = String(username || buildFallbackUsername(user)).trim();
  const authStateFields = buildUserAuthStateFields(user);

  return {
    username: resolvedUsername,
    usernameLower: normalizeUsername(resolvedUsername),
    ...authStateFields,
    photoURL: user?.photoURL || DEFAULT_AVATAR_URL,
    createdAt: new Date(),
    updatedAt: new Date(),
    best2048: 0,
    bestFlappy: 0,
    bestSolitaire: 0,
    bestPong: 0,
    bestSnake: 0,
    bestTetris: 0,
    activeSessions: [deviceId],
    maxSessions: 2,
    currentGameSession: null,
    lastActivity: new Date(),
    ...extraFields
  };
}

function buildPublicProfileData(userId, profileData = {}, user = null) {
  const fallbackUser = user || {
    uid: userId,
    email: profileData.email || "",
    displayName: profileData.displayName || profileData.username || ""
  };

  const resolvedUsername = String(
    profileData.username
    || profileData.displayName
    || user?.displayName
    || buildFallbackUsername(fallbackUser)
  ).trim();

  const best2048 = Number(profileData.best2048) || 0;
  const bestFlappy = Number(profileData.bestFlappy) || 0;

  return {
    username: resolvedUsername,
    usernameLower: normalizeUsername(resolvedUsername),
    photoURL: profileData.photoURL || user?.photoURL || DEFAULT_AVATAR_URL,
    best2048,
    bestFlappy,
    bestSolitaire: Number(profileData.bestSolitaire) || 0,
    bestPong: Number(profileData.bestPong) || 0,
    bestSnake: Number(profileData.bestSnake) || 0,
    bestTetris: Number(profileData.bestTetris) || 0,
    streak: Number(profileData.streak) || 0,
    globalRating: calculateGlobalRating(best2048, bestFlappy),
    updatedAt: new Date()
  };
}

export async function syncPublicProfile(userId, profileData = {}, user = null) {
  if (!userId) return null;

  if (!user?.emailVerified) {
    await deleteDoc(doc(db, "public_profiles", userId)).catch(() => {});
    return null;
  }

  const publicProfile = buildPublicProfileData(userId, profileData, user);
  await setDoc(doc(db, "public_profiles", userId), publicProfile, { merge: true });
  return publicProfile;
}

export async function createUserProfile(user, options = {}) {
  const deviceId = options.deviceId || getDeviceId();
  const username = String(options.username || buildFallbackUsername(user)).trim();
  const email = options.email || user?.email || "";
  const extraFields = options.extraFields || {};
  const profile = buildUserProfileData({ ...user, email }, deviceId, username, extraFields);

  await reserveUsername(user.uid, username);

  try {
    await setDoc(doc(db, "users", user.uid), profile);
    await syncPublicProfile(user.uid, profile, user).catch(() => {});
    return profile;
  } catch (error) {
    await releaseUsername(username, user.uid).catch(() => {});
    throw error;
  }
}

function getTodayDateString() {
  return new Date().toLocaleDateString("en-CA");
}

export async function registerSession(user, deviceId = getDeviceId(), options = {}) {
  const trackStreak = Boolean(options.trackStreak);
  const userId = typeof user === "string" ? user : user?.uid;

  if (!userId) {
    throw new Error("registerSession requires a user id");
  }

  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    if (!user || typeof user === "string") {
      throw new Error("registerSession requires a user object when the profile is missing");
    }

    const extraFields = trackStreak
      ? { streak: 1, lastLoginDate: getTodayDateString() }
      : {};

    return createUserProfile(user, { deviceId, extraFields });
  }

  const userData = userSnap.data();
  const activeSessions = Array.isArray(userData.activeSessions) ? [...userData.activeSessions] : [];
  const maxSessions = typeof userData.maxSessions === "number" ? userData.maxSessions : 2;
  const updates = {
    lastActivity: new Date(),
    updatedAt: new Date()
  };

  if (typeof user !== "string") {
    const authStateFields = buildUserAuthStateFields(user, userData);
    updates.email = user.email || userData.email || "";
    updates.photoURL = user.photoURL || userData.photoURL || DEFAULT_AVATAR_URL;
    Object.assign(updates, authStateFields);
  }

  const resolvedUsername = userData.username || userData.displayName || (typeof user !== "string" ? buildFallbackUsername(user) : "");
  if (resolvedUsername) {
    await syncUsernameReservation(userId, resolvedUsername).catch(() => {});

    if (!userData.username) {
      updates.username = resolvedUsername;
      updates.usernameLower = normalizeUsername(resolvedUsername);
    }
  }

  if (trackStreak) {
    const todayDate = getTodayDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = yesterday.toLocaleDateString("en-CA");

    let streak = userData.streak || 0;
    const lastLoginDate = userData.lastLoginDate;

    if (lastLoginDate !== todayDate) {
      streak = lastLoginDate === yesterdayDate ? streak + 1 : 1;
    }

    updates.streak = streak;
    updates.lastLoginDate = todayDate;
  }

  if (!activeSessions.includes(deviceId)) {
    if (activeSessions.length >= maxSessions) {
      activeSessions.shift();
      activeSessions.push(deviceId);
      updates.activeSessions = activeSessions;
    } else {
      updates.activeSessions = arrayUnion(deviceId);
    }
  }

  if (!Object.prototype.hasOwnProperty.call(userData, "activeSessions")) {
    updates.activeSessions = [deviceId];
    updates.maxSessions = 2;
    updates.currentGameSession = userData.currentGameSession || null;
  }

  await updateDoc(userRef, updates);
  const mergedProfile = { ...userData, ...updates };
  await syncPublicProfile(userId, mergedProfile, typeof user !== "string" ? user : null).catch(() => {});
  return mergedProfile;
}

export async function syncUserProfileAuthState(user) {
  if (!user?.uid) return null;

  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);
  if (!snapshot.exists()) return null;

  const patch = {
    ...buildUserAuthStateFields(user, snapshot.data()),
    updatedAt: new Date()
  };

  await updateDoc(userRef, patch);
  const mergedProfile = { ...snapshot.data(), ...patch };
  await syncPublicProfile(user.uid, mergedProfile, user).catch(() => {});
  return mergedProfile;
}

export async function markVerificationEmailSent(userId) {
  if (!userId) return;

  try {
    await updateDoc(doc(db, "users", userId), {
      verificationEmailSentAt: new Date(),
      updatedAt: new Date()
    });
  } catch {
    // Ignore metadata sync failures so verification still works.
  }
}

export async function sendAppVerificationEmail(user, nextPath = "/games/") {
  if (!user) {
    throw new Error("A signed-in user is required to send a verification email.");
  }

  const response = await callBackendJson("/send-verification-email", {
    authRequired: true,
    authUser: user,
    body: {
      email: normalizeEmail(user.email || ""),
      nextPath: sanitizeNextPath(nextPath)
    }
  });

  return response;
}

export async function safelyReloadUser(user = auth.currentUser) {
  if (!user) return null;

  try {
    await user.reload();
  } catch (error) {
    console.warn("User reload failed:", error);
  }

  const refreshedUser = auth.currentUser || user;

  if (refreshedUser?.emailVerified) {
    try {
      await getIdToken(refreshedUser, true);
    } catch (error) {
      console.warn("Token refresh failed:", error);
    }
  }

  return auth.currentUser || refreshedUser;
}

export async function cleanupFailedSignup(user, username = "") {
  if (!user?.uid) return;

  await releaseUsername(username, user.uid).catch(() => {});
  await deleteDoc(doc(db, "users", user.uid)).catch(() => {});
  await deleteDoc(doc(db, "public_profiles", user.uid)).catch(() => {});

  try {
    await deleteUser(user);
  } catch (error) {
    console.warn("Signup cleanup failed:", error);
    throw error;
  }
}

function getStoredAttemptLog(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getRateLimitState(key, options = {}) {
  const maxAttempts = options.maxAttempts ?? 5;
  const windowMs = options.windowMs ?? 60_000;
  const storageKey = `webarcade-rate-limit:${key}`;
  const now = Date.now();

  const attempts = getStoredAttemptLog(storageKey).filter(timestamp => now - Number(timestamp) < windowMs);
  localStorage.setItem(storageKey, JSON.stringify(attempts));

  const allowed = attempts.length < maxAttempts;
  const retryAfterMs = allowed || !attempts.length ? 0 : Math.max(windowMs - (now - attempts[0]), 0);

  return {
    allowed,
    retryAfterMs
  };
}

export function recordRateLimitAttempt(key, options = {}) {
  const windowMs = options.windowMs ?? 60_000;
  const storageKey = `webarcade-rate-limit:${key}`;
  const now = Date.now();
  const attempts = getStoredAttemptLog(storageKey).filter(timestamp => now - Number(timestamp) < windowMs);
  attempts.push(now);
  localStorage.setItem(storageKey, JSON.stringify(attempts));
}

export function clearRateLimitState(key) {
  localStorage.removeItem(`webarcade-rate-limit:${key}`);
}

export function getCooldownRemaining(key) {
  const until = Number(localStorage.getItem(`webarcade-cooldown:${key}`) || 0);
  return Math.max(until - Date.now(), 0);
}

export function startCooldown(key, cooldownMs) {
  localStorage.setItem(`webarcade-cooldown:${key}`, String(Date.now() + cooldownMs));
}

export async function unregisterSession(userId, deviceId) {
  try {
    await updateDoc(doc(db, "users", userId), {
      activeSessions: arrayRemove(deviceId),
      currentGameSession: null
    });
  } catch {
    // Ignore logout cleanup errors so sign-out can continue.
  }
}

export async function requestCustomPasswordReset(email) {
  const response = await callBackendJson("/reset-password", {
    authRequired: false,
    body: {
      email: normalizeEmail(email)
    }
  });
  return response;
}

export async function sendTestEmailCampaign(payload) {
  const testEmails = Array.isArray(payload?.testEmails)
    ? payload.testEmails.map(normalizeEmail).filter(Boolean)
    : [];

  const response = await callBackendJson("/send-test-email", {
    authRequired: true,
    body: {
      htmlMessage: String(payload?.htmlMessage || ""),
      subject: String(payload?.subject || ""),
      testEmail: normalizeEmail(payload?.testEmail || ""),
      testEmails,
      textMessage: String(payload?.textMessage || "")
    }
  });
  return response;
}

export async function triggerBulkEmailCampaign(payload) {
  const normalizedAudience = String(payload?.audienceType || "verified-users").trim().toLowerCase();
  const audienceType = [
    "verified-users",
    "unverified-users",
    "all-users",
    "specific-user"
  ].includes(normalizedAudience)
    ? normalizedAudience
    : "verified-users";

  const response = await callBackendJson("/bulk-email", {
    authRequired: true,
    body: {
      audienceType,
      dryRun: Boolean(payload?.dryRun),
      htmlMessage: String(payload?.htmlMessage || ""),
      includeUnverified: audienceType === "all-users" || audienceType === "unverified-users",
      specificEmail: normalizeEmail(payload?.specificEmail || ""),
      subject: String(payload?.subject || ""),
      textMessage: String(payload?.textMessage || "")
    }
  });
  return response;
}

async function callBackendJson(path, options = {}) {
  const requestUrl = `${API_BASE_URL}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (options.authRequired) {
    const baseUser = options.authUser || auth.currentUser;
    const currentUser = baseUser ? await safelyReloadUser(baseUser) : null;
    if (!currentUser) {
      throw createBackendApiError({
        code: "unauthenticated",
        message: "You must be signed in.",
        status: 401
      });
    }

    const idToken = await getIdToken(currentUser, true);
    headers.Authorization = `Bearer ${idToken}`;
  }

  const response = await fetch(requestUrl, {
    body: JSON.stringify(options.body || {}),
    headers,
    method: options.method || "POST"
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.ok === false) {
    throw createBackendApiError({
      code: payload?.code || "internal",
      message: payload?.message || "The request could not be completed right now.",
      status: response.status || 500
    });
  }

  return payload;
}

function createBackendApiError(details) {
  const error = new Error(details.message || "Backend request failed.");
  error.code = details.code || "internal";
  error.status = details.status || 500;
  return error;
}

export function watchMailCampaign(campaignId, onUpdate, onError) {
  if (!campaignId) {
    return () => {};
  }

  return onSnapshot(doc(db, "mail_campaigns", campaignId), snapshot => {
    if (!snapshot.exists()) {
      onUpdate(null);
      return;
    }

    onUpdate({
      id: snapshot.id,
      ...snapshot.data()
    });
  }, onError);
}

export {
  EmailAuthProvider,
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  createUserWithEmailAndPassword,
  deleteDoc,
  deleteUser,
  doc,
  getDoc,
  getDocs,
  limit,
  onAuthStateChanged,
  onSnapshot,
  orderBy,
  query,
  reauthenticateWithCredential,
  serverTimestamp,
  setDoc,
  signInWithEmailAndPassword,
  signOut,
  updateDoc,
  updatePassword,
  updateProfile,
  verifyBeforeUpdateEmail,
  where
};
