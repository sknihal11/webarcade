import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
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

export const ADMIN_EMAIL = "nihalsk2022@gmail.com";
export const DEFAULT_AVATAR_URL = "https://i.imgur.com/8Km9tLL.png";

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

let persistencePromise;

export function ensureBrowserPersistence() {
  if (!persistencePromise) {
    persistencePromise = setPersistence(auth, browserLocalPersistence).catch(error => {
      console.warn("Auth persistence setup failed:", error);
    });
  }

  return persistencePromise;
}

export function isAdminEmail(email) {
  return Boolean(email) && email.toLowerCase() === ADMIN_EMAIL;
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

export function validateEmail(email) {
  if (!email) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Invalid email format";

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

  const domain = email.split("@")[1]?.toLowerCase();
  if (blockedDomains.includes(domain)) return "Please use a real email";

  const suspiciousPatterns = [/^test\d*@/i, /^fake\d*@/i, /^demo\d*@/i, /^admin@/i, /^sample@/i, /^user\d+@/i];
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(email)) return "Please use a real email";
  }

  return null;
}

export function validatePassword(password) {
  if (!password || password.length < 8) return "Password must be at least 8 characters";
  if (!/[a-zA-Z]/.test(password)) return "Password must contain letters";
  if (!/\d/.test(password)) return "Password must contain at least one number";
  return null;
}

export function calculatePasswordStrength(password) {
  let strength = 0;

  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/\d/.test(password)) strength++;
  if (/[^a-zA-Z0-9]/.test(password)) strength++;

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
  const domain = email.split("@")[1];
  if (!domain) return false;

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

  return {
    username: resolvedUsername,
    usernameLower: normalizeUsername(resolvedUsername),
    email: user?.email || "",
    photoURL: user?.photoURL || DEFAULT_AVATAR_URL,
    createdAt: new Date(),
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

export async function createUserProfile(user, options = {}) {
  const deviceId = options.deviceId || getDeviceId();
  const username = String(options.username || buildFallbackUsername(user)).trim();
  const email = options.email || user?.email || "";
  const extraFields = options.extraFields || {};
  const profile = buildUserProfileData({ ...user, email }, deviceId, username, extraFields);

  await reserveUsername(user.uid, username);

  try {
    await setDoc(doc(db, "users", user.uid), profile);
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
    lastActivity: new Date()
  };

  if (typeof user !== "string") {
    updates.email = user.email || userData.email || "";
    updates.photoURL = user.photoURL || userData.photoURL || DEFAULT_AVATAR_URL;
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
  return { ...userData, ...updates };
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

export {
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
  serverTimestamp,
  setDoc,
  signInWithEmailAndPassword,
  signOut,
  updateDoc,
  updateProfile,
  where
};
