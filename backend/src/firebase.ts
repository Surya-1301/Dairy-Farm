import { initializeApp, getApps } from "firebase/app";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User
} from "firebase/auth";
import { sendPasswordResetLinkEmail } from "./utils/emailOtp";
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, setDoc } from "firebase/firestore";
import type { ActiveUser, Role, UserProfile } from "./types";

export const OWNER_EMAIL = (process.env.EXPO_PUBLIC_OWNER_EMAIL ?? "").trim().toLowerCase();
const USER_PROFILES_COLLECTION = "userProfiles";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID
};

const missingKeys = Object.entries(firebaseConfig)
  .filter(([key, value]) => key !== "measurementId" && !value)
  .map(([key]) => key);

if (missingKeys.length > 0) {
  console.warn(`Missing Firebase mobile env vars: ${missingKeys.join(", ")}`);
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = (() => {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
  } catch {
    return getAuth(app);
  }
})();
export const db = getFirestore(app);

export function normalizeEmail(rawValue: string) {
  return rawValue.trim().toLowerCase();
}

export function normalizePhone(rawValue: string) {
  return rawValue.replace(/\D/g, "");
}

export function getRoleForEmail(email: string): Role {
  return normalizeEmail(email) === OWNER_EMAIL ? "owner" : "user";
}

export function getActiveUserFromFirebase(user: User | null): ActiveUser | null {
  const email = normalizeEmail(user?.email ?? "");
  if (!email) {
    return null;
  }

  const role = getRoleForEmail(email);
  return {
    email,
    role,
    phone: ""
  };
}

function buildProfile(
  email: string,
  role: Role,
  overrides: Partial<Pick<UserProfile, "name" | "phone" | "farmName" | "avatarUrl">> = {}
): UserProfile {
  const normalizedEmail = normalizeEmail(email);

  return {
    email: normalizedEmail,
    phone: normalizePhone(overrides.phone ?? ""),
    role,
    name: overrides.name?.trim() || (role === "owner" ? "Owner" : normalizedEmail.split("@")[0] || "User"),
    farmName: overrides.farmName?.trim() || (role === "owner" ? "Raipur Dairy Farm" : ""),
    avatarUrl: overrides.avatarUrl ?? "",
    updatedAt: new Date().toISOString()
  };
}

export async function saveUserProfile(profile: UserProfile) {
  await setDoc(doc(db, USER_PROFILES_COLLECTION, profile.email), profile, { merge: true });
}

export async function ensureUserProfile(
  user: User,
  overrides: Partial<Pick<UserProfile, "name" | "phone" | "farmName" | "avatarUrl">> = {}
) {
  const email = normalizeEmail(user.email ?? "");
  if (!email) {
    return null;
  }

  const profile = buildProfile(email, getRoleForEmail(email), overrides);
  await saveUserProfile(profile);
  return profile;
}

export function subscribeFirebaseAuth(listener: (user: User | null) => void) {
  return onAuthStateChanged(auth, listener);
}

export async function signIn(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const trimmedPassword = password.trim();

  if (!normalizedEmail || !trimmedPassword) {
    throw new Error("Enter both email and password.");
  }

  const credential = await signInWithEmailAndPassword(auth, normalizedEmail, trimmedPassword);
  await ensureUserProfile(credential.user);
}

export async function signUp(email: string, password: string, name: string, phone = "") {
  const normalizedEmail = normalizeEmail(email);
  const trimmedPassword = password.trim();
  const trimmedName = name.trim();

  if (!normalizedEmail || !trimmedPassword) {
    throw new Error("Enter both email and password.");
  }

  const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, trimmedPassword);
  await ensureUserProfile(credential.user, { name: trimmedName || undefined, phone: phone || undefined });
}

const CLOUD_FUNCTION_URL =
  "https://us-central1-raipur-dairy-farmm.cloudfunctions.net/generatePasswordResetLink";
const RESET_REDIRECT_URL = "https://dairy-farm.tech/reset-password";

export async function resetPassword(email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) throw new Error("Enter an email address.");

  const idToken = await auth.currentUser?.getIdToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;

  const response = await fetch(CLOUD_FUNCTION_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: normalizedEmail })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Failed to generate reset link.");

  const resetUrl = `${RESET_REDIRECT_URL}?oobCode=${encodeURIComponent(data.oobCode)}`;
  await sendPasswordResetLinkEmail(normalizedEmail, normalizedEmail, resetUrl);
}

export async function logout() {
  await signOut(auth);
}

export async function fetchUserProfiles() {
  const snapshot = await getDocs(collection(db, USER_PROFILES_COLLECTION));
  return snapshot.docs
    .map((item) => item.data() as UserProfile)
    .filter((profile) => profile.role === "user")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteUserProfile(email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return;
  }

  if (normalizedEmail === OWNER_EMAIL) {
    throw new Error("Cannot delete owner account.");
  }

  await deleteDoc(doc(db, USER_PROFILES_COLLECTION, normalizedEmail));
}

export async function deleteAccountPermanently() {
  const currentUser = auth.currentUser;
  if (!currentUser?.email) {
    throw new Error("No account is signed in.");
  }

  const normalizedEmail = normalizeEmail(currentUser.email);
  if (normalizedEmail === OWNER_EMAIL) {
    throw new Error("Cannot delete owner account.");
  }

  await deleteUserProfile(currentUser.email);
  await deleteUser(currentUser);
}

export async function fetchProfileForCurrentUser(): Promise<UserProfile | null> {
  const currentUser = auth.currentUser;
  if (!currentUser?.email) return null;

  const snapshot = await getDoc(doc(db, USER_PROFILES_COLLECTION, normalizeEmail(currentUser.email)));
  if (!snapshot.exists()) return null;
  return snapshot.data() as UserProfile;
}

export async function updateUserProfileByEmail(
  email: string,
  updates: Partial<Pick<UserProfile, "name" | "phone" | "email">>
): Promise<UserProfile | null> {
  const normalized = normalizeEmail(email);
  const snapshot = await getDoc(doc(db, USER_PROFILES_COLLECTION, normalized));
  if (!snapshot.exists()) {
    return null;
  }

  const existing = snapshot.data() as UserProfile;
  const newEmail = updates.email ? normalizeEmail(updates.email) : normalized;

  const nextProfile: UserProfile = {
    ...existing,
    name: updates.name?.trim() ?? existing.name,
    phone: normalizePhone(updates.phone ?? existing.phone),
    updatedAt: new Date().toISOString(),
    email: newEmail
  };

  await setDoc(doc(db, USER_PROFILES_COLLECTION, newEmail), nextProfile, { merge: true });
  return nextProfile;
}

export async function updateProfileForCurrentUser(
  updates: Pick<UserProfile, "name" | "email" | "phone"> & { avatarUrl?: string; farmName?: string }
) {
  const currentUser = auth.currentUser;
  if (!currentUser?.email) {
    throw new Error("No account is signed in.");
  }

  const currentEmail = normalizeEmail(currentUser.email);
  const nextEmail = normalizeEmail(updates.email);
  if (nextEmail !== currentEmail) {
    throw new Error("Email changes are not supported.");
  }

  const profile: UserProfile = {
    email: currentEmail,
    role: getRoleForEmail(currentEmail),
    name: updates.name.trim(),
    phone: normalizePhone(updates.phone),
    farmName: updates.farmName?.trim() ?? "",
    avatarUrl: updates.avatarUrl ?? "",
    updatedAt: new Date().toISOString()
  };

  await saveUserProfile(profile);
  return profile;
}
