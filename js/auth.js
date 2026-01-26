<script type="module">
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCzomf89xZhgcPsfYXKsYspCt-CiUVzjBA",
  authDomain: "webarcade-d4c3d.firebaseapp.com",
  projectId: "webarcade-d4c3d",
  storageBucket: "webarcade-d4c3d.firebasestorage.app",
  messagingSenderId: "918209461327",
  appId: "1:918209461327:web:bd9c1a2431f9b5c66ffe3a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

/* ===== AUTH UI HANDLING ===== */
onAuthStateChanged(auth, user => {
  const authBox = document.getElementById("auth-box");

  if (!authBox) return;

  if (user) {
    authBox.innerHTML = `
      <span style="opacity:.85;font-size:14px">${user.email}</span>
      <button onclick="logout()" class="logout-btn">Logout</button>
    `;
  } else {
    authBox.innerHTML = `
      <a href="login.html" class="login-btn">Login</a>
      <a href="signup.html" class="signup-btn">Sign up</a>
    `;
  }
});

/* ===== LOGOUT ===== */
window.logout = function () {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
};

/* ===== PROTECT GAMES ===== */
if (location.pathname.includes("2048")) {
  onAuthStateChanged(auth, user => {
    if (!user) {
      window.location.href = "login.html";
    }
  });
}
</script>
