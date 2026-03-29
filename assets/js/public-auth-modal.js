import {
  auth,
  buildVerificationRedirect,
  checkPasswordBreach,
  cleanupFailedSignup,
  clearRateLimitState,
  createUserProfile,
  createUserWithEmailAndPassword,
  db,
  doc,
  ensureBrowserPersistence,
  getDeviceId,
  getDoc,
  getRateLimitState,
  isUsernameTaken,
  normalizeEmail,
  onAuthStateChanged,
  recordRateLimitAttempt,
  registerSession,
  requestCustomPasswordReset,
  resolveLoginEmail,
  sanitizeNextPath,
  safelyReloadUser,
  sendAppVerificationEmail,
  setAuthPersistence,
  signInWithEmailAndPassword,
  signOut,
  syncUserProfileAuthState,
  unregisterSession,
  updateProfile,
  validateEmail,
  validatePassword,
  validateUsername
} from "./firebase-client.js";

await ensureBrowserPersistence();

const params = new URLSearchParams(window.location.search);
const NEXT_PATH = sanitizeNextPath(params.get("next"));
const INITIAL_AUTH_MODE = (() => {
  const requestedMode = String(params.get("auth") || "").trim().toLowerCase();
  if (requestedMode === "signup") return "signup";
  if (requestedMode === "recover") return "recover";
  if (requestedMode === "login") return "login";
  return "";
})();

const modal = document.getElementById("modal");
const loginBtn = document.getElementById("loginBtn");
const userInfo = document.getElementById("userInfo");
const usernameDisplay = document.getElementById("usernameDisplay");
const sessionBadge = document.querySelector(".session-badge");
const modalTitle = document.getElementById("modalTitle");
const actionBtn = document.getElementById("actionBtn");
const statusEl = document.getElementById("status");
const switchText = document.getElementById("switchText");
const usernameField = document.getElementById("usernameField");
const usernameInput = document.getElementById("username");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");
const usernameError = document.getElementById("usernameError");
const strengthContainer = document.getElementById("strengthContainer");
const passwordWarning = document.getElementById("passwordWarning");
const breachInfo = document.getElementById("breachInfo");
const switchContainer = document.querySelector(".switch");

const emailField = emailInput?.closest(".field");
const passwordField = passwordInput?.closest(".field");
const emailLabel = emailField?.querySelector("label");
const passwordLabel = passwordField?.querySelector("label");

const forgotRow = ensureForgotPasswordRow();
const forgotPasswordLink = forgotRow?.querySelector("button");
const signupLegalNote = ensureSignupLegalNote();

let currentUser = null;
let currentDeviceId = null;
let authFlowInFlight = false;
let modalMode = "login";

setMode("login");
hidePasswordExtras();

onAuthStateChanged(auth, async rawUser => {
  if (!rawUser) {
    currentUser = null;
    currentDeviceId = null;
    loginBtn.style.display = "";
    userInfo.classList.remove("visible");

    if (INITIAL_AUTH_MODE) {
      setTimeout(() => openModal(INITIAL_AUTH_MODE), 80);
    }
    return;
  }

  if (authFlowInFlight) {
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
      sessionBadge.textContent = user.emailVerified ? "VERIFIED" : "VERIFY EMAIL";
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

window.openModal = (mode = "login") => {
  if (currentUser?.emailVerified) {
    window.location.href = NEXT_PATH;
    return;
  }

  if (currentUser && !currentUser.emailVerified) {
    window.location.href = buildVerificationRedirect(NEXT_PATH);
    return;
  }

  modal.classList.add("open");
  setMode(mode);
  clearModalFeedback();
  emailInput.value = "";
  passwordInput.value = "";
  usernameInput.value = "";
  focusPrimaryField();
};

window.closeModal = event => {
  if (!event || event.target === modal || event.target.classList.contains("close-btn")) {
    modal.classList.remove("open");
    clearModalFeedback();
  }
};

window.toggleMode = event => {
  event?.preventDefault?.();
  setMode(modalMode === "login" ? "signup" : "login");
  clearModalFeedback();
  passwordInput.value = "";
  if (modalMode === "signup") {
    usernameInput.value = "";
  }
  focusPrimaryField();
};

window.requireLogin = event => {
  event?.preventDefault();

  if (!currentUser) {
    openModal("login");
    return;
  }

  if (!currentUser.emailVerified) {
    window.location.href = buildVerificationRedirect(NEXT_PATH);
    return;
  }

  window.location.href = NEXT_PATH;
};

window.logout = async function logout() {
  if (currentUser && currentDeviceId) {
    await unregisterSession(currentUser.uid, currentDeviceId);
  }

  await signOut(auth);
  location.reload();
};

actionBtn.addEventListener("click", async () => {
  if (modalMode === "signup") {
    await handleSignup();
    return;
  }

  if (modalMode === "recover") {
    await handleRecovery();
    return;
  }

  await handleLogin();
});

forgotPasswordLink?.addEventListener("click", () => {
  setMode("recover");
  clearModalFeedback();
  focusPrimaryField();
});

[usernameInput, emailInput, passwordInput].forEach(input => {
  input?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      actionBtn.click();
    }
  });
});

usernameInput?.addEventListener("input", () => {
  usernameInput.classList.remove("invalid");
  usernameError.textContent = "";

  if (modalMode === "signup" && passwordInput.value) {
    refreshSignupPasswordState();
  }
});

emailInput?.addEventListener("input", () => {
  emailInput.classList.remove("invalid");
  emailError.textContent = "";

  if (modalMode === "signup" && passwordInput.value) {
    refreshSignupPasswordState();
  }
});

passwordInput?.addEventListener("input", () => {
  if (modalMode === "signup") {
    refreshSignupPasswordState();
    return;
  }

  passwordInput.classList.remove("invalid", "warning");
  passwordError.textContent = "";
  passwordWarning.textContent = "";
  passwordWarning.classList.remove("show");
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && modal.classList.contains("open")) {
    modal.classList.remove("open");
  }
});

async function handleLogin() {
  clearModalFeedback();

  const rateLimit = getRateLimitState("public-login", { maxAttempts: 6, windowMs: 60_000 });
  if (!rateLimit.allowed) {
    showStatus(
      `Too many login attempts. Try again in ${Math.ceil(rateLimit.retryAfterMs / 1000)} seconds.`,
      true
    );
    return;
  }

  const identifier = String(emailInput.value || "").trim();
  const password = passwordInput.value;
  const emailErrorMessage = validateLoginIdentifier(identifier);

  if (emailErrorMessage) {
    setFieldError(emailInput, emailError, emailErrorMessage);
    return;
  }

  if (!password) {
    setFieldError(passwordInput, passwordError, "Enter your password to continue.");
    return;
  }

  authFlowInFlight = true;
  let redirecting = false;
  setLoading(true, "ENTERING...");

  try {
    const loginEmail = await resolveLoginEmail(identifier);
    if (!loginEmail) {
      throw { code: "auth/invalid-credential" };
    }

    const credential = await signInWithEmailAndPassword(auth, loginEmail, password);
    clearRateLimitState("public-login");

    const user = await safelyReloadUser(credential.user);
    currentUser = user;
    currentDeviceId = getDeviceId();

    await registerSession(user, currentDeviceId).catch(() => {});
    await syncUserProfileAuthState(user).catch(() => {});

    redirecting = true;
    if (!user.emailVerified) {
      window.location.href = buildVerificationRedirect(NEXT_PATH);
      return;
    }

    window.location.href = NEXT_PATH;
  } catch (error) {
    authFlowInFlight = false;
    recordRateLimitAttempt("public-login", { windowMs: 60_000 });
    showStatus(mapLoginError(error), true);
  } finally {
    if (!redirecting) {
      setLoading(false, "ENTER ARCADE");
    }
  }
}

async function handleRecovery() {
  clearModalFeedback();

  const rateLimit = getRateLimitState("public-password-reset", { maxAttempts: 3, windowMs: 300_000 });
  if (!rateLimit.allowed) {
    showStatus(
      `Please wait ${Math.ceil(rateLimit.retryAfterMs / 1000)} seconds before requesting another reset email.`,
      true
    );
    return;
  }

  const identifier = String(emailInput.value || "").trim();
  const identifierError = validateLoginIdentifier(identifier);

  if (identifierError) {
    setFieldError(emailInput, emailError, identifierError);
    return;
  }

  setLoading(true, "SENDING...");

  try {
    const loginEmail = await resolveLoginEmail(identifier);
    if (loginEmail) {
      await requestCustomPasswordReset(loginEmail);
    }
  } catch {
    // Keep the user-facing message generic to avoid enumeration.
  } finally {
    recordRateLimitAttempt("public-password-reset", { windowMs: 300_000 });
    setLoading(false, "SEND RESET EMAIL");
  }

  showStatus("If this account exists, a reset email is on the way.", false);
}

async function handleSignup() {
  clearModalFeedback();

  const rateLimit = getRateLimitState("public-signup", { maxAttempts: 4, windowMs: 60_000 });
  if (!rateLimit.allowed) {
    showStatus(
      `Too many signup attempts. Try again in ${Math.ceil(rateLimit.retryAfterMs / 1000)} seconds.`,
      true
    );
    return;
  }

  const username = String(usernameInput.value || "").trim();
  const email = normalizeEmail(emailInput.value);
  const password = passwordInput.value;

  const usernameValidation = validateUsername(username);
  const emailValidation = validateEmail(email);
  const passwordValidation = validatePassword(password, { username, email });

  if (usernameValidation) {
    setFieldError(usernameInput, usernameError, usernameValidation);
    return;
  }

  if (emailValidation) {
    setFieldError(emailInput, emailError, emailValidation);
    return;
  }

  if (passwordValidation) {
    setFieldError(passwordInput, passwordError, passwordValidation);
    return;
  }

  try {
    if (await isUsernameTaken(username)) {
      setFieldError(usernameInput, usernameError, "That username is already taken.");
      return;
    }
  } catch {
    showStatus("We could not verify username availability right now. Please try again.", true);
    return;
  }

  const breachCount = await checkPasswordBreach(password);
  if (breachCount > 0) {
    setFieldWarning(
      passwordInput,
      passwordWarning,
      `This password appears in ${breachCount.toLocaleString()} known breaches. You can continue, but a different password is safer.`
    );
  }

  authFlowInFlight = true;
  let redirecting = false;
  setLoading(true, "CREATING...");
  showStatus("Creating your account...", false);

  try {
    await setAuthPersistence("local");
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: username });

    try {
      await createUserProfile(credential.user, {
        username,
        email,
        extraFields: {
          verificationStatus: "pending"
        }
      });
    } catch (profileError) {
      await cleanupFailedSignup(credential.user, username).catch(() => {});
      throw profileError;
    }

    const reloadedUser = await safelyReloadUser(credential.user);
    currentUser = reloadedUser;
    currentDeviceId = getDeviceId();
    await syncUserProfileAuthState(reloadedUser).catch(() => {});
    clearRateLimitState("public-signup");

    let verificationSendFailed = false;
    try {
      await sendAppVerificationEmail(reloadedUser, NEXT_PATH);
    } catch (verificationError) {
      console.warn("Verification email send failed:", verificationError);
      verificationSendFailed = true;
    }

    redirecting = true;
    const verifyUrl = `/verify-email/?next=${encodeURIComponent(NEXT_PATH)}&new=1${verificationSendFailed ? "&mail=failed" : ""}`;
    window.location.href = verifyUrl;
  } catch (error) {
    authFlowInFlight = false;
    recordRateLimitAttempt("public-signup", { windowMs: 60_000 });
    handleSignupError(error);
  } finally {
    if (!redirecting) {
      setLoading(false, "CREATE ACCOUNT");
    }
  }
}

function setMode(mode) {
  modalMode = mode === "signup" ? "signup" : mode === "recover" ? "recover" : "login";

  const isSignup = modalMode === "signup";
  const isRecovery = modalMode === "recover";
  modalTitle.textContent = isSignup ? "CREATE ACCOUNT" : isRecovery ? "RESET PASSWORD" : "LOGIN";
  actionBtn.textContent = isSignup ? "CREATE ACCOUNT" : isRecovery ? "SEND RESET EMAIL" : "ENTER ARCADE";
  usernameField.classList.toggle("hidden", !isSignup);
  passwordField.classList.toggle("hidden", isRecovery);
  forgotRow.classList.toggle("hidden", isSignup || isRecovery);
  signupLegalNote.classList.toggle("hidden", !isSignup);

  emailLabel.textContent = isSignup ? "Gmail address" : "Username or Gmail";
  passwordLabel.textContent = "Password";
  emailInput.placeholder = isSignup ? "name@gmail.com" : "name@gmail.com or username";
  passwordInput.placeholder = isSignup ? "Use 8+ characters with a number" : "Enter your password";
  passwordInput.autocomplete = isSignup ? "new-password" : "current-password";
  usernameInput.placeholder = "3-20 characters";

  switchText.innerHTML = isSignup
    ? "Already have an account? <a>Login</a>"
    : isRecovery
      ? "Back to <a>Login</a>"
      : "New player? <a>Create account</a>";

  hidePasswordExtras();
}

function focusPrimaryField() {
  setTimeout(() => {
    if (modalMode === "signup") {
      usernameInput.focus();
      return;
    }

    emailInput.focus();
  }, 120);
}

function clearModalFeedback() {
  clearFieldError(usernameInput, usernameError);
  clearFieldError(emailInput, emailError);
  clearFieldError(passwordInput, passwordError);
  clearFieldWarning(passwordInput, passwordWarning);
  hidePasswordExtras();
  clearStatus();
}

function hidePasswordExtras() {
  strengthContainer?.classList.add("hidden");
  breachInfo?.classList.add("hidden");
}

function setFieldError(input, errorEl, message) {
  input?.classList.remove("warning");
  input?.classList.add("invalid");
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.add("show");
  }
}

function clearFieldError(input, errorEl) {
  input?.classList.remove("invalid");
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.classList.remove("show");
  }
}

function setFieldWarning(input, warningEl, message) {
  input?.classList.remove("invalid");
  input?.classList.add("warning");
  if (warningEl) {
    warningEl.textContent = message;
    warningEl.classList.add("show");
  }
}

function clearFieldWarning(input, warningEl) {
  input?.classList.remove("warning");
  if (warningEl) {
    warningEl.textContent = "";
    warningEl.classList.remove("show");
  }
}

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = `status ${isError ? "error" : "success"}`;
}

function clearStatus() {
  statusEl.textContent = "";
  statusEl.className = "status";
}

function setLoading(loading, label) {
  actionBtn.disabled = loading;
  actionBtn.classList.toggle("loading", loading);
  actionBtn.textContent = label;
}

function ensureForgotPasswordRow() {
  const existingRow = document.getElementById("forgotPasswordRow");
  if (existingRow) return existingRow;

  const row = document.createElement("div");
  row.className = "modal-utility-row";
  row.id = "forgotPasswordRow";

  const button = document.createElement("button");
  button.className = "modal-utility-link";
  button.id = "forgotPasswordLink";
  button.type = "button";
  button.textContent = "Forgot password?";

  row.appendChild(button);
  actionBtn.parentElement.insertBefore(row, actionBtn);
  return row;
}

function ensureSignupLegalNote() {
  const existingNote = document.getElementById("signupLegalNote");
  if (existingNote) return existingNote;

  const note = document.createElement("div");
  note.className = "info-text hidden";
  note.id = "signupLegalNote";
  note.innerHTML = 'By creating an account, you agree to the <a href="/terms/">Terms</a> and <a href="/privacy/">Privacy Policy</a>.';

  switchContainer?.parentElement?.insertBefore(note, switchContainer);
  return note;
}

function validateLoginIdentifier(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "Enter your username or Gmail address.";
  }

  if (rawValue.includes("@")) {
    return validateEmail(rawValue);
  }

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(rawValue)) {
    return "Enter your username or Gmail address.";
  }

  return null;
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
      return "The username or password did not match our records.";
    default:
      return "We could not complete the login request right now. Please try again.";
  }
}

function handleSignupError(error) {
  switch (error?.code) {
    case "auth/email-already-in-use":
      setFieldError(emailInput, emailError, "This Gmail address is already registered.");
      showStatus("This Gmail address already has an account. Try logging in instead.", true);
      return;
    case "auth/invalid-email":
      setFieldError(emailInput, emailError, "Enter a valid Gmail address ending in @gmail.com.");
      showStatus("This Gmail address could not be accepted.", true);
      return;
    case "auth/weak-password":
      setFieldError(passwordInput, passwordError, "Use at least 8 characters with one number.");
      showStatus("This password is still too weak for signup.", true);
      return;
    default:
      showStatus(error?.message || "We could not complete signup right now. Please try again.", true);
  }
}

function refreshSignupPasswordState() {
  clearFieldError(passwordInput, passwordError);
  clearFieldWarning(passwordInput, passwordWarning);

  const password = passwordInput.value;
  if (!password) {
    return null;
  }

  const validation = validatePassword(password, {
    username: usernameInput.value,
    email: emailInput.value
  });

  if (validation) {
    setFieldError(passwordInput, passwordError, validation);
    return validation;
  }

  return null;
}
