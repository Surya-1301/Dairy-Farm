import {
  createUserWithEmailAndPassword,
  confirmPasswordReset,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword as firebaseSignInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User
} from "firebase/auth";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { auth, db } from "./config";
import { deleteUserDataByEmail } from "./data";

const OWNER_EMAIL = (import.meta.env.VITE_OWNER_EMAIL as string ?? "").trim().toLowerCase();
const AUTH_CHANGE_EVENT = "dairy-farm-auth-changed";
const USER_PROFILES_COLLECTION = "userProfiles";
const USER_PROFILE_STORAGE_PREFIX = "dairy-farm-user-profile:";

type ActiveUser = {
  phone: string;
  email: string;
  role: "owner" | "user";
};

export type UserProfile = {
  phone: string;
  email: string;
  role: "owner" | "user";
  name: string;
  farmName: string;
  avatarUrl?: string;
  updatedAt: string;
};

let activeFirebaseUser: User | null = auth?.currentUser ?? null;
let authInitialized = !auth;
let profileCache = new Map<string, UserProfile>();

function normalizeEmail(rawValue: string) {
  return rawValue.trim().toLowerCase();
}

function normalizePhone(rawValue: string) {
  return rawValue.replace(/\D/g, "");
}

function getRoleForEmail(email: string): "owner" | "user" {
  return normalizeEmail(email) === OWNER_EMAIL ? "owner" : "user";
}

function upsertProfileCache(profile: UserProfile) {
  profileCache.set(profile.email, profile);
}

function getProfileStorageKey(email: string) {
  return `${USER_PROFILE_STORAGE_PREFIX}${normalizeEmail(email)}`;
}

function canUseBrowserStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function saveUserProfileToStorage(profile: UserProfile) {
  if (!canUseBrowserStorage()) {
    return;
  }

  window.localStorage.setItem(getProfileStorageKey(profile.email), JSON.stringify(profile));
}

function getUserProfileFromStorage(email: string): UserProfile | null {
  if (!canUseBrowserStorage()) {
    return null;
  }

  const rawProfile = window.localStorage.getItem(getProfileStorageKey(email));
  if (!rawProfile) {
    return null;
  }

  try {
    const parsedProfile = JSON.parse(rawProfile) as Partial<UserProfile>;
    if (!parsedProfile.email) {
      return null;
    }

    const storedProfile: UserProfile = {
      phone: normalizePhone(parsedProfile.phone ?? ""),
      email: normalizeEmail(parsedProfile.email),
      role: parsedProfile.role === "owner" ? "owner" : "user",
      name: parsedProfile.name?.trim() || "User",
      farmName: parsedProfile.farmName?.trim() || "",
      avatarUrl: parsedProfile.avatarUrl?.trim() || "",
      updatedAt: parsedProfile.updatedAt || new Date().toISOString()
    };

    upsertProfileCache(storedProfile);
    return storedProfile;
  } catch (error) {
    console.error("Error loading user profile from storage:", error);
    return null;
  }
}

function removeUserProfileFromStorage(email: string) {
  if (!canUseBrowserStorage()) {
    return;
  }

  window.localStorage.removeItem(getProfileStorageKey(email));
}

function emitAuthChange() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

function requireFirebaseAuth() {
  if (!auth) {
    throw new Error("Firebase auth is not configured. Add your VITE_FIREBASE_* values first.");
  }

  return auth;
}

function isConfigurationError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("auth/configuration-not-found") ||
    error.message.includes("auth/operation-not-allowed") ||
    error.message.includes("auth/admin-restricted-operation") ||
    error.message.includes("auth/invalid-api-key")
  );
}

function toFriendlyAuthError(error: unknown) {
  if (!(error instanceof Error)) {
    return new Error("Authentication failed.");
  }

  if (error.message.includes("auth/operation-not-allowed")) {
    return new Error("Enable Email/Password sign-in in Firebase Authentication.");
  }

  if (error.message.includes("auth/configuration-not-found") || error.message.includes("auth/invalid-api-key")) {
    return new Error("Firebase auth is not configured correctly for this app.");
  }

  if (error.message.includes("auth/user-not-found")) {
    return new Error("This account does not exist. Please create a new account.");
  }

  if (error.message.includes("auth/invalid-credential") || error.message.includes("auth/wrong-password")) {
    return new Error("This account does not exist or the password is incorrect. Please create a new account if you deleted it.");
  }

  if (error.message.includes("auth/email-already-in-use")) {
    return new Error("An account with this email already exists. Use Sign in.");
  }

  if (error.message.includes("auth/weak-password")) {
    return new Error("Choose a stronger password.");
  }

  if (error.message.includes("auth/requires-recent-login")) {
    return new Error("Please sign in again before deleting your account.");
  }

  if (error.message.includes("auth/too-many-requests")) {
    return new Error("Too many requests. Please wait a few minutes and try again.");
  }

  return error;
}

function upsertUserProfile(profile: Omit<UserProfile, "updatedAt">) {
  const nextProfile: UserProfile = {
    ...profile,
    phone: normalizePhone(profile.phone),
    email: normalizeEmail(profile.email),
    updatedAt: new Date().toISOString()
  };

  upsertProfileCache(nextProfile);
  saveUserProfileToStorage(nextProfile);
  return nextProfile;
}

async function saveUserProfileToCloud(profile: UserProfile) {
  if (!db) {
    throw new Error("Firebase Firestore is not configured. Check your VITE_FIREBASE_* environment variables.");
  }

  try {
    await setDoc(doc(db, USER_PROFILES_COLLECTION, profile.email), profile, { merge: true });
  } catch (error) {
    console.error("Error saving user profile to Firestore:", error);
    throw error;
  }
}

async function getUserProfileFromCloud(email: string): Promise<UserProfile | null> {
  if (!db) {
    return profileCache.get(email) ?? getUserProfileFromStorage(email);
  }

  try {
    const snapshot = await getDoc(doc(db, USER_PROFILES_COLLECTION, email));
    if (!snapshot.exists()) {
      return null;
    }

    const profile = snapshot.data() as UserProfile;
    if (!profile.email) {
      return null;
    }

    upsertProfileCache(profile);
    return profile;
  } catch (error) {
    console.error("Error loading user profile from Firestore:", error);
    return profileCache.get(email) ?? getUserProfileFromStorage(email);
  }
}

async function removeUserProfileFromCloud(email: string) {
  if (!db) {
    removeUserProfileFromStorage(email);
    return;
  }

  try {
    await deleteDoc(doc(db, USER_PROFILES_COLLECTION, normalizeEmail(email)));
  } catch (error) {
    console.error("Error deleting user profile from Firestore:", error);
  }

  removeUserProfileFromStorage(email);
}

function buildProfileForEmail(
  email: string,
  role: "owner" | "user",
  overrides: Partial<Pick<UserProfile, "name" | "phone" | "farmName" | "avatarUrl">> = {}
): Omit<UserProfile, "updatedAt"> {
  const normalizedEmail = normalizeEmail(email);

  return {
    email: normalizedEmail,
    phone: normalizePhone(overrides.phone ?? ""),
    role,
    name:
      overrides.name?.trim() ||
      (role === "owner" ? "Owner" : normalizedEmail.split("@")[0] || "User"),
    farmName: overrides.farmName?.trim() || (role === "owner" ? "Raipur Dairy Farm" : ""),
    avatarUrl: overrides.avatarUrl ?? ""
  };
}


function syncFirebaseUser(user: User | null) {
  activeFirebaseUser = user;
  authInitialized = true;

  if (user) {
    void fetchCurrentUserProfile().then(() => {
      emitAuthChange();
    });
  }

  emitAuthChange();
}

if (auth) {
  onAuthStateChanged(auth, (user) => {
    syncFirebaseUser(user);
  });
}

export function isAuthReady() {
  return authInitialized;
}

export function isAuthenticated() {
  return activeFirebaseUser !== null;
}

export function getActiveUser(): ActiveUser | null {
  const email = normalizeEmail(activeFirebaseUser?.email ?? "");
  if (!email) {
    return null;
  }

  const role = getRoleForEmail(email);
  const storedProfile = profileCache.get(email);

  return {
    email,
    role,
    phone: storedProfile?.phone ?? ""
  };
}

export function getCurrentUserProfile(): UserProfile | null {
  const activeUser = getActiveUser();
  if (!activeUser) {
    return null;
  }

  const storedProfile = profileCache.get(activeUser.email);
  if (storedProfile) {
    return storedProfile;
  }

  const persistedProfile = getUserProfileFromStorage(activeUser.email);
  if (persistedProfile) {
    return persistedProfile;
  }

  const nextProfile = buildProfileForEmail(activeUser.email, activeUser.role);
  const savedProfile = upsertUserProfile(nextProfile);
  void saveUserProfileToCloud(savedProfile);
  return profileCache.get(activeUser.email) ?? null;
}

export async function fetchCurrentUserProfile(): Promise<UserProfile | null> {
  const activeUser = getActiveUser();
  if (!activeUser) {
    return null;
  }

  const cloudProfile = await getUserProfileFromCloud(activeUser.email);
  if (cloudProfile) {
    return cloudProfile;
  }

  const fallbackProfile = getCurrentUserProfile();
  if (!fallbackProfile) {
    return null;
  }

  await saveUserProfileToCloud(fallbackProfile);
  return fallbackProfile;
}

/**
 * Owner-only helper to update any user's profile by email.
 * Firestore rules still enforce permissions server-side; this is a client-side guard.
 */
export async function updateUserProfileByEmail(
  email: string,
  updates: Partial<Pick<UserProfile, "name" | "farmName" | "phone" | "avatarUrl" | "role" | "email">>
): Promise<UserProfile | null> {
  const active = getActiveUser();
  if (!active || active.role !== "owner") {
    throw new Error("Only owner may update other user profiles.");
  }

  const normalized = normalizeEmail(email);
  // try to fetch a cloud profile first, then fallback to cache
  const existing = (await getUserProfileFromCloud(normalized)) ?? profileCache.get(normalized) ?? null;
  if (!existing) return null;

  const newEmail = updates.email ? normalizeEmail(updates.email) : normalized;

  const nextProfile: UserProfile = {
    ...existing,
    name: updates.name?.trim() ?? existing.name,
    farmName: updates.farmName ?? existing.farmName,
    phone: normalizePhone(updates.phone ?? existing.phone),
    avatarUrl: updates.avatarUrl !== undefined ? updates.avatarUrl : existing.avatarUrl,
    role: updates.role ?? existing.role,
    updatedAt: new Date().toISOString(),
    email: newEmail
  };

  if (newEmail !== normalized) {
    profileCache.delete(normalized);
  }
  upsertProfileCache(nextProfile);
  await saveUserProfileToCloud(nextProfile);
  return profileCache.get(newEmail) ?? null;
}

export async function updateCurrentUserProfile(
  updates: Pick<UserProfile, "name" | "farmName" | "email" | "phone"> & { avatarUrl?: string }
): Promise<UserProfile | null> {
  const currentUser = activeFirebaseUser;
  if (!currentUser?.email) {
    return null;
  }

  const currentEmail = normalizeEmail(currentUser.email);
  const nextEmail = normalizeEmail(updates.email);
  if (nextEmail !== currentEmail) {
    throw new Error("Email address changes are not supported in this version.");
  }

  const currentProfile = getCurrentUserProfile();
  const nextProfile: Omit<UserProfile, "updatedAt"> = {
    email: currentEmail,
    role: getRoleForEmail(currentEmail),
    name: updates.name.trim(),
    phone: normalizePhone(updates.phone),
    farmName: updates.farmName.trim(),
    avatarUrl: updates.avatarUrl !== undefined ? updates.avatarUrl : currentProfile?.avatarUrl ?? ""
  };

  const savedProfile = upsertUserProfile(nextProfile);
  await saveUserProfileToCloud(savedProfile);
  emitAuthChange();

  return profileCache.get(currentEmail) ?? null;
}

export function getAllUserProfiles(): UserProfile[] {
  return Array.from(profileCache.values())
    .filter((profile) => profile.role === "user")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function fetchAllUserProfiles(): Promise<UserProfile[]> {
  if (!db) {
    return getAllUserProfiles();
  }

  try {
    const snapshot = await getDocs(collection(db, USER_PROFILES_COLLECTION));
    const cloudProfiles = snapshot.docs
      .map((item) => item.data() as UserProfile)
      .filter((profile) => profile.email && profile.role);

    cloudProfiles.forEach((profile) => upsertProfileCache(profile));
  } catch (error) {
    console.error("Error loading user profiles from Firestore:", error);
  }

  return getAllUserProfiles();
}

export function subscribeAuthState(listener: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onChange = () => listener();
  window.addEventListener(AUTH_CHANGE_EVENT, onChange);

  return () => {
    window.removeEventListener(AUTH_CHANGE_EVENT, onChange);
  };
}

export function isOwnerLoggedIn() {
  return getActiveUser()?.role === "owner";
}

export async function signInWithEmailPassword(email: string, password: string): Promise<void> {
  const firebaseAuth = requireFirebaseAuth();
  const normalizedEmail = normalizeEmail(email);
  const trimmedPassword = password.trim();

  if (!normalizedEmail || !trimmedPassword) {
    throw new Error("Enter both email and password.");
  }

  try {
    const credential = await firebaseSignInWithEmailAndPassword(firebaseAuth, normalizedEmail, trimmedPassword);
    syncFirebaseUser(credential.user);
  } catch (error) {
    throw toFriendlyAuthError(error);
  }
}

export async function signUpWithEmailPassword(email: string, password: string, name: string, phone = ""): Promise<void> {
  const firebaseAuth = requireFirebaseAuth();
  const normalizedEmail = normalizeEmail(email);
  const trimmedPassword = password.trim();
  const trimmedName = name.trim();

  if (!normalizedEmail || !trimmedPassword) {
    throw new Error("Enter both email and password.");
  }

  try {
    const credential = await createUserWithEmailAndPassword(firebaseAuth, normalizedEmail, trimmedPassword);
    const role = getRoleForEmail(normalizedEmail);
    const profile = upsertUserProfile(
      buildProfileForEmail(normalizedEmail, role, { name: trimmedName || undefined, phone: phone || undefined })
    );
    await saveUserProfileToCloud(profile);
    syncFirebaseUser(credential.user);
  } catch (error) {
    throw toFriendlyAuthError(error);
  }
}

export async function requestPasswordReset(email: string): Promise<"firebase"> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) throw new Error("Enter an email address.");

  try {
    const resetUrl = `${window.location.origin}/reset-password?email=${encodeURIComponent(normalizedEmail)}`;
    const { sendPasswordResetLinkEmail } = await import("../utils/emailOtp");
    await sendPasswordResetLinkEmail(normalizedEmail, normalizedEmail, resetUrl);
    return "firebase";
  } catch (error) {
    if (isConfigurationError(error)) throw toFriendlyAuthError(error);
    console.error("Password reset email error:", error);
    throw new Error(error instanceof Error ? error.message : "We could not send a reset email for this account.");
  }
}

export async function confirmNewPassword(oobCode: string, newPassword: string): Promise<void> {
  const firebaseAuth = requireFirebaseAuth();
  try {
    await confirmPasswordReset(firebaseAuth, oobCode, newPassword);
  } catch (error) {
    if ((error as { code?: string })?.code === "auth/expired-action-code") {
      throw new Error("This reset link has expired. Please request a new one.");
    }
    if ((error as { code?: string })?.code === "auth/invalid-action-code") {
      throw new Error("This reset link is invalid or already used. Please request a new one.");
    }
    if ((error as { code?: string })?.code === "auth/weak-password") {
      throw new Error("Password must be at least 6 characters.");
    }
    throw new Error("Failed to reset password. Please try again.");
  }
}

export async function logout(): Promise<void> {
  if (!auth) {
    syncFirebaseUser(null);
    return;
  }

  try {
    await firebaseSignOut(auth);
  } finally {
    syncFirebaseUser(null);
  }
}

export async function deleteCurrentAccount(): Promise<void> {
  const firebaseAuth = requireFirebaseAuth();
  const currentUser = firebaseAuth.currentUser;

  if (!currentUser?.email) {
    throw new Error("No account is currently signed in.");
  }

  const normalizedEmail = normalizeEmail(currentUser.email);
  if (normalizedEmail === OWNER_EMAIL) {
    throw new Error("Owner account cannot be deleted from here.");
  }

  await Promise.all([
    removeUserProfileFromCloud(normalizedEmail),
    deleteUserDataByEmail(normalizedEmail)
  ]);

  try {
    await deleteUser(currentUser);
  } catch (error) {
    throw toFriendlyAuthError(error);
  }

  profileCache.delete(normalizedEmail);
  removeUserProfileFromStorage(normalizedEmail);
  syncFirebaseUser(null);
}

export async function deleteUserByEmail(email: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new Error("Invalid email address.");
  }

  if (normalizedEmail === OWNER_EMAIL) {
    throw new Error("Cannot delete the owner account.");
  }

  profileCache.delete(normalizedEmail);
  
  try {
    await removeUserProfileFromCloud(normalizedEmail);
    await deleteUserDataByEmail(normalizedEmail);
  } catch (error) {
    console.error("Error cleaning up user data:", error);
    // Continue anyway - the account is deleted from Firebase Auth
  }
  
  // Emit auth change event to notify listeners
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
  }
}
