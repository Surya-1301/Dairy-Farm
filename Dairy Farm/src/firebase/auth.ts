import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword as firebaseSignInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User
} from "firebase/auth";
import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";
import { auth, db } from "./config";

const OWNER_PHONE = "9999999999";
const OWNER_EMAIL = "ss058012@gmail.com";
const OWNER_PASSWORD = "Rebel_0102";
const AUTH_CHANGE_EVENT = "dairy-farm-auth-changed";
const USER_PROFILES_KEY = "dairy-farm-user-profiles";
const USER_CREDENTIALS_KEY = "dairy-farm-user-credentials";
const PROFILE_DRAFT_KEY = "dairy-farm-profile-draft";
const CUSTOMER_LIST_KEY = "dairy-farm-customers";
const CUSTOMER_SHEET_KEY = "dairy-farm-customer-sheet";
const CUSTOMER_SHEET_HISTORY_KEY = "dairy-farm-customer-sheet-history";
const USER_PROFILES_COLLECTION = "userProfiles";

type ActiveUser = {
  phone: string;
  email: string;
  role: "owner" | "user";
};

type LegacyStoredCredential = {
  email: string;
  password: string;
  name: string;
  role: "owner" | "user";
  phone: string;
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

function normalizeEmail(rawValue: string) {
  return rawValue.trim().toLowerCase();
}

function normalizePhone(rawValue: string) {
  return rawValue.replace(/\D/g, "");
}

function getRoleForEmail(email: string): "owner" | "user" {
  return normalizeEmail(email) === OWNER_EMAIL ? "owner" : "user";
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
    return new Error("No Firebase account was found for this email.");
  }

  if (error.message.includes("auth/invalid-credential") || error.message.includes("auth/wrong-password")) {
    return new Error("Invalid email or password.");
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

  return error;
}

function getStoredUserProfiles(): UserProfile[] {
  if (typeof window === "undefined") {
    return [];
  }

  const rawValue = window.localStorage.getItem(USER_PROFILES_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    return JSON.parse(rawValue) as UserProfile[];
  } catch {
    return [];
  }
}

function saveUserProfiles(profiles: UserProfile[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(USER_PROFILES_KEY, JSON.stringify(profiles));
}

function mergeStoredUserProfiles(nextProfiles: UserProfile[]) {
  const profilesByEmail = new Map<string, UserProfile>();

  getStoredUserProfiles().forEach((profile) => {
    profilesByEmail.set(profile.email, profile);
  });

  nextProfiles.forEach((profile) => {
    profilesByEmail.set(profile.email, profile);
  });

  saveUserProfiles(Array.from(profilesByEmail.values()));
}

function getLegacyStoredCredentials(): LegacyStoredCredential[] {
  if (typeof window === "undefined") {
    return [];
  }

  const rawValue = window.localStorage.getItem(USER_CREDENTIALS_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    return JSON.parse(rawValue) as LegacyStoredCredential[];
  } catch {
    return [];
  }
}

function saveLegacyStoredCredentials(credentials: LegacyStoredCredential[]) {
  if (typeof window === "undefined") {
    return;
  }

  if (credentials.length === 0) {
    window.localStorage.removeItem(USER_CREDENTIALS_KEY);
    return;
  }

  window.localStorage.setItem(USER_CREDENTIALS_KEY, JSON.stringify(credentials));
}

function getLegacyStoredCredentialByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  return getLegacyStoredCredentials().find((credential) => credential.email === normalizedEmail) ?? null;
}

function removeLegacyCredentialForEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const remainingCredentials = getLegacyStoredCredentials().filter(
    (credential) => credential.email !== normalizedEmail
  );
  saveLegacyStoredCredentials(remainingCredentials);
}

function upsertUserProfile(profile: Omit<UserProfile, "updatedAt">) {
  const normalizedPhone = normalizePhone(profile.phone);
  const normalizedEmail = normalizeEmail(profile.email);
  const profiles = getStoredUserProfiles();
  const now = new Date().toISOString();
  const index = profiles.findIndex((item) => item.email === normalizedEmail);

  const nextProfile: UserProfile = {
    ...profile,
    phone: normalizedPhone,
    email: normalizedEmail,
    updatedAt: now
  };

  if (index >= 0) {
    profiles[index] = { ...profiles[index], ...nextProfile };
  } else {
    profiles.push(nextProfile);
  }

  saveUserProfiles(profiles);
  return nextProfile;
}

async function saveUserProfileToCloud(profile: UserProfile) {
  if (!db) {
    return;
  }

  try {
    await setDoc(doc(db, USER_PROFILES_COLLECTION, profile.email), profile, { merge: true });
  } catch (error) {
    console.error("Error saving user profile to Firestore:", error);
  }
}

function removeUserProfileForEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  saveUserProfiles(getStoredUserProfiles().filter((profile) => profile.email !== normalizedEmail));
}

async function removeUserProfileFromCloud(email: string) {
  if (!db) {
    return;
  }

  try {
    await deleteDoc(doc(db, USER_PROFILES_COLLECTION, normalizeEmail(email)));
  } catch (error) {
    console.error("Error deleting user profile from Firestore:", error);
  }
}

function clearAccountStorage(email: string) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedEmail = normalizeEmail(email);

  window.localStorage.removeItem(`milk-data-${normalizedEmail}`);
  window.localStorage.removeItem(`dairy-farm-profile-draft-${normalizedEmail}`);
  window.localStorage.removeItem(`customers-${normalizedEmail}`);
  window.localStorage.removeItem(PROFILE_DRAFT_KEY);
  window.localStorage.removeItem(CUSTOMER_LIST_KEY);
  window.localStorage.removeItem(CUSTOMER_SHEET_KEY);
  window.localStorage.removeItem(CUSTOMER_SHEET_HISTORY_KEY);
}

function buildProfileForEmail(
  email: string,
  role: "owner" | "user",
  overrides: Partial<Pick<UserProfile, "name" | "phone" | "farmName" | "avatarUrl">> = {}
): Omit<UserProfile, "updatedAt"> {
  const normalizedEmail = normalizeEmail(email);
  const legacyCredential = getLegacyStoredCredentialByEmail(normalizedEmail);

  return {
    email: normalizedEmail,
    phone: normalizePhone(overrides.phone ?? legacyCredential?.phone ?? (role === "owner" ? OWNER_PHONE : "")),
    role,
    name:
      overrides.name?.trim() ||
      legacyCredential?.name?.trim() ||
      (role === "owner" ? "Owner" : normalizedEmail.split("@")[0] || "User"),
    farmName: overrides.farmName?.trim() || (role === "owner" ? "Raipur Dairy Farm" : ""),
    avatarUrl: overrides.avatarUrl ?? ""
  };
}

function ensureCurrentUserProfile(user: User, overrides: Partial<Pick<UserProfile, "name" | "phone" | "farmName" | "avatarUrl">> = {}) {
  const email = normalizeEmail(user.email ?? "");
  if (!email) {
    return null;
  }

  const role = getRoleForEmail(email);
  const existingProfile = getStoredUserProfiles().find((profile) => profile.email === email);
  const baseProfile = buildProfileForEmail(email, role, overrides);

  const nextProfile = upsertUserProfile({
    ...baseProfile,
    name: overrides.name?.trim() || existingProfile?.name || baseProfile.name,
    phone: overrides.phone ?? existingProfile?.phone ?? baseProfile.phone,
    farmName: overrides.farmName ?? existingProfile?.farmName ?? baseProfile.farmName,
    avatarUrl: overrides.avatarUrl ?? existingProfile?.avatarUrl ?? baseProfile.avatarUrl
  });
  void saveUserProfileToCloud(nextProfile);

  removeLegacyCredentialForEmail(email);

  return getStoredUserProfiles().find((profile) => profile.email === email) ?? null;
}

function syncFirebaseUser(user: User | null) {
  activeFirebaseUser = user;
  authInitialized = true;

  if (user) {
    ensureCurrentUserProfile(user);
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
  const storedProfile = getStoredUserProfiles().find((profile) => profile.email === email);

  return {
    email,
    role,
    phone: storedProfile?.phone ?? (role === "owner" ? OWNER_PHONE : "")
  };
}

export function getCurrentUserProfile(): UserProfile | null {
  const activeUser = getActiveUser();
  if (!activeUser) {
    return null;
  }

  const storedProfile = getStoredUserProfiles().find((profile) => profile.email === activeUser.email);
  if (storedProfile) {
    return storedProfile;
  }

  const nextProfile = buildProfileForEmail(activeUser.email, activeUser.role);
  const savedProfile = upsertUserProfile(nextProfile);
  void saveUserProfileToCloud(savedProfile);
  return getStoredUserProfiles().find((profile) => profile.email === activeUser.email) ?? null;
}

export function updateCurrentUserProfile(
  updates: Pick<UserProfile, "name" | "farmName" | "email" | "phone"> & { avatarUrl?: string }
): UserProfile | null {
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
  void saveUserProfileToCloud(savedProfile);
  emitAuthChange();

  return getCurrentUserProfile();
}

export function getAllUserProfiles(): UserProfile[] {
  return getStoredUserProfiles()
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

    mergeStoredUserProfiles(cloudProfiles);
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
  const onStorage = (event: StorageEvent) => {
    if (event.key === USER_PROFILES_KEY || event.key === USER_CREDENTIALS_KEY) {
      listener();
    }
  };

  window.addEventListener(AUTH_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(AUTH_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
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
    ensureCurrentUserProfile(credential.user);
    syncFirebaseUser(credential.user);
  } catch (error) {
    throw toFriendlyAuthError(error);
  }
}

export async function signUpWithEmailPassword(email: string, password: string, name: string): Promise<void> {
  const firebaseAuth = requireFirebaseAuth();
  const normalizedEmail = normalizeEmail(email);
  const trimmedPassword = password.trim();
  const trimmedName = name.trim();

  if (!normalizedEmail || !trimmedPassword) {
    throw new Error("Enter both email and password.");
  }

  // Allow owner account creation with correct credentials
  if (normalizedEmail === OWNER_EMAIL) {
    if (trimmedPassword !== OWNER_PASSWORD) {
      throw new Error("Invalid owner password.");
    }
    
    try {
      const credential = await createUserWithEmailAndPassword(firebaseAuth, normalizedEmail, trimmedPassword);
      ensureCurrentUserProfile(credential.user, { name: trimmedName || "Owner" });
      syncFirebaseUser(credential.user);
    } catch (error) {
      throw toFriendlyAuthError(error);
    }
    return;
  }

  try {
    const credential = await createUserWithEmailAndPassword(firebaseAuth, normalizedEmail, trimmedPassword);
    ensureCurrentUserProfile(credential.user, { name: trimmedName });
    syncFirebaseUser(credential.user);
  } catch (error) {
    throw toFriendlyAuthError(error);
  }
}

export async function requestPasswordReset(email: string): Promise<"firebase"> {
  const firebaseAuth = requireFirebaseAuth();
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new Error("Enter an email address.");
  }

  try {
    await sendPasswordResetEmail(firebaseAuth, normalizedEmail);
    return "firebase";
  } catch (error) {
    if (isConfigurationError(error)) {
      throw toFriendlyAuthError(error);
    }

    throw new Error("We could not send a reset email for this account.");
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

  try {
    await deleteUser(currentUser);
  } catch (error) {
    throw toFriendlyAuthError(error);
  }

  removeUserProfileForEmail(normalizedEmail);
  await removeUserProfileFromCloud(normalizedEmail);
  removeLegacyCredentialForEmail(normalizedEmail);
  clearAccountStorage(normalizedEmail);
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

  // Remove user profile
  removeUserProfileForEmail(normalizedEmail);
  await removeUserProfileFromCloud(normalizedEmail);
  
  // Remove legacy credentials
  removeLegacyCredentialForEmail(normalizedEmail);
  
  // Clear all account storage
  clearAccountStorage(normalizedEmail);
  
  // Emit auth change event to notify listeners
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
  }
}
