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

/* AUTH STATE */
onAuthStateChanged(auth, user => {
  const authBox = document.getElementById("auth-box");
  if (!authBox) return;

  if (user) {
    authBox.innerHTML = `
      <span style="font-size:14px;opacity:.85">${user.email}</span>
      <button class="logout-btn" id="logoutBtn">Logout</button>
    `;

    document.getElementById("logoutBtn").onclick = () => {
      signOut(auth).then(() => location.reload());
    };
  } else {
    authBox.innerHTML = `
      <a href="login.html" class="login-btn">Login</a>
      <a href="signup.html" class="signup-btn">Sign up</a>
    `;
  }
});
