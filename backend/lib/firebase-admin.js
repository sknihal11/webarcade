import admin from "firebase-admin";

import {
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
  FIREBASE_PROJECT_ID
} from "./config.js";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY,
      projectId: FIREBASE_PROJECT_ID
    }),
    projectId: FIREBASE_PROJECT_ID
  });
}

const auth = admin.auth();
const firestore = admin.firestore();

export {
  admin,
  auth,
  firestore
};
