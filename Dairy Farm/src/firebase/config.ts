import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";

const env = import.meta.env;

const requiredKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID"
] as const;

const missingKeys = requiredKeys.filter((key) => !env[key]);
const hasFirebaseConfig = missingKeys.length === 0;

if (!hasFirebaseConfig) {
  console.warn(`Missing Firebase env vars: ${missingKeys.join(", ")}`);
}

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;

export const analyticsPromise = isSupported().then((supported) => {
  if (!supported || !app) {
    return null;
  }

  return getAnalytics(app);
});
