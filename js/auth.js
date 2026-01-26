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

// 🔐 Redirect if not logged in
onAuthStateChanged(auth, user => {
  if (!user && location.pathname.includes("2048")) {
    window.location.href = "login.html";
  }
});

// 🚪 Logout helper
window.logout = () => {
  signOut(auth).then(() => {
    window.location.href = "login.html";
  });
};
</script>
