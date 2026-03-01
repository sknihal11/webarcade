import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCzomf89xZhgcPsfYXKsYspCt-CiUVzjBA",
    authDomain: "webarcade-d4c3d.firebaseapp.com",
    databaseURL: "https://webarcade-d4c3d-default-rtdb.firebaseio.com/",
    projectId: "webarcade-d4c3d",
    storageBucket: "webarcade-d4c3d.firebasestorage.app",
    messagingSenderId: "918209461327",
    appId: "1:918209461327:web:bd9c1a2431f9b5c66ffe3a"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, firebaseConfig };
