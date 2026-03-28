import {
  auth,
  buildVerificationRedirect,
  clearRateLimitState,
  db,
  doc,
  ensureBrowserPersistence,
  getDeviceId,
  getDoc,
  getRateLimitState,
  onAuthStateChanged,
  recordRateLimitAttempt,
  registerSession,
  safelyReloadUser,
  signInWithEmailAndPassword,
  signOut,
  syncUserProfileAuthState,
  unregisterSession,
  validateEmail
} from "./firebase-client.js";

await ensureBrowserPersistence();

const modal = document.getElementById("modal");
const loginBtn = document.getElementById("loginBtn");
const userInfo = document.getElementById("userInfo");
const usernameDisplay = document.getElementById("usernameDisplay");
const sessionBadge = document.querySelector(".session-badge");
const actionBtn = document.getElementById("actionBtn");
const statusEl = document.getElementById("status");
const switchText = document.getElementById("switchText");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");

let currentUser = null;
let currentDeviceId = null;

switchText.innerHTML = 'New player? <a href="signup.html">Create account →</a>';

onAuthStateChanged(auth, async rawUser => {
  if (!rawUser) {
    currentUser = null;
    currentDeviceId = null;
    loginBtn.style.display = "";
    userInfo.classList.remove("visible");
    return;
  }

  const user = await safelyReloadUser(rawUser);
  currentUser = user;
  currentDeviceId = getDeviceId();

  try {
    await registerSession(user, currentDeviceId);
    await syncUserProfileAuthState(user).catch(() => {});

    loginBtn.style.display = "none";
    userInfo.classList.add("visible");

    const snapshot = await getDoc(doc(db, "users", user.uid));
    const username = snapshot.exists()
      ? snapshot.data().username || user.displayName || "PLAYER_1"
      : user.displayName || "PLAYER_1";

    usernameDisplay.textContent = username;
    if (sessionBadge) {
      sessionBadge.textContent = user.emailVerified ? "● VERIFIED" : "● VERIFY EMAIL";
    }
  } catch (error) {
    console.error("Public auth session error:", error);
    if (error.message.includes("Session limit")) {
      alert(error.message);
      await signOut(auth);
      location.reload();
    }
  }
});

window.openModal = () => {
  if (currentUser?.emailVerified) {
    window.location.href = "blog.html";
    return;
  }

  if (currentUser && !currentUser.emailVerified) {
    window.location.href = buildVerificationRedirect("blog.html");
    return;
  }

  modal.classList.add("open");
  clearErrors();
  clearStatus();
  emailInput.value = "";
  passwordInput.value = "";
  setTimeout(() => emailInput.focus(), 120);
};

window.closeModal = event => {
  if (!event || event.target === modal || event.target.classList.contains("close-btn")) {
    modal.classList.remove("open");
  }
};

window.toggleMode = () => {
  window.location.href = "signup.html";
};

window.requireLogin = event => {
  event?.preventDefault();

  if (!currentUser) {
    window.location.href = "login.html?next=blog.html";
    return;
  }

  if (!currentUser.emailVerified) {
    window.location.href = buildVerificationRedirect("blog.html");
    return;
  }

  window.location.href = "blog.html";
};

window.logout = async function logout() {
  if (currentUser && currentDeviceId) {
    await unregisterSession(currentUser.uid, currentDeviceId);
  }

  await signOut(auth);
  location.reload();
};

actionBtn.addEventListener("click", async () => {
  clearErrors();
  clearStatus();

  const rateLimit = getRateLimitState("public-login", { maxAttempts: 6, windowMs: 60_000 });
  if (!rateLimit.allowed) {
    showStatus(`Too many login attempts. Try again in ${Math.ceil(rateLimit.retryAfterMs / 1000)} seconds.`, true);
    return;
  }

  const email = emailInput.value;
  const password = passwordInput.value;
  const emailErrorMessage = validateEmail(email);

  if (emailErrorMessage) {
    emailError.textContent = emailErrorMessage;
    return;
  }

  if (!password) {
    passwordError.textContent = "Enter your password to continue";
    return;
  }

  setLoading(true, "AUTHENTICATING...");

  try {
    const credential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    clearRateLimitState("public-login");

    const user = await safelyReloadUser(credential.user);
    await syncUserProfileAuthState(user).catch(() => {});

    if (!user.emailVerified) {
      showStatus("Please verify your email before continuing.", true);
      window.location.href = buildVerificationRedirect("blog.html");
      return;
    }

    showStatus("Login successful. Redirecting...", false);
    window.location.href = "blog.html";
  } catch (error) {
    recordRateLimitAttempt("public-login", { windowMs: 60_000 });
    showStatus(mapLoginError(error), true);
  } finally {
    setLoading(false, "ENTER ARCADE");
  }
});

[emailInput, passwordInput].forEach(input => {
  input?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      actionBtn.click();
    }
  });
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && modal.classList.contains("open")) {
    modal.classList.remove("open");
  }
});

function clearErrors() {
  emailError.textContent = "";
  passwordError.textContent = "";
}

function clearStatus() {
  statusEl.textContent = "";
  statusEl.className = "status";
}

function showStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.className = `status ${isError ? "error" : "success"}`;
}

function setLoading(loading, label) {
  actionBtn.disabled = loading;
  actionBtn.classList.toggle("loading", loading);
  actionBtn.textContent = label;
}

function mapLoginError(error) {
  switch (error?.code) {
    case "auth/too-many-requests":
      return "Too many attempts were detected. Wait a moment, then try again.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact support if you believe this is a mistake.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "The Gmail address and password combination did not match our records.";
    default:
      return "We could not complete the login request right now. Please try again.";
  }
}
