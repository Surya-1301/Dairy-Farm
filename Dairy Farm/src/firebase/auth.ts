import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from "firebase/auth";
import { auth } from "./config";

const OWNER_PHONE = "9999999999";
const OWNER_EMAIL = "ss058012@gmail.com";
const OWNER_PASSWORD = "Rebel_0102";
const AUTH_SESSION_KEY = "dairy-farm-owner-session";
const AUTH_USER_KEY = "dairy-farm-active-user";
const USER_PROFILES_KEY = "dairy-farm-user-profiles";
const USER_CREDENTIALS_KEY = "dairy-farm-user-credentials";
const DELETED_EMAILS_KEY = "dairy-farm-deleted-emails";
const AUTH_CHANGE_EVENT = "dairy-farm-auth-changed";
const PROFILE_DRAFT_KEY = "dairy-farm-profile-draft";
const CUSTOMER_LIST_KEY = "dairy-farm-customers";
const CUSTOMER_SHEET_KEY = "dairy-farm-customer-sheet";
const CUSTOMER_SHEET_HISTORY_KEY = "dairy-farm-customer-sheet-history";

type AuthMode = "signin" | "signup";

type ActiveUser = {
  phone: string;
  email: string;
  role: "owner" | "user";
};

type StoredCredential = {
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

function normalizeEmail(rawValue: string) {
  return rawValue.trim().toLowerCase();
}

function normalizePhone(rawValue: string) {
  return rawValue.replace(/\D/g, "");
}

function setOwnerSession(isLoggedIn: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  if (isLoggedIn) {
    window.localStorage.setItem(AUTH_SESSION_KEY, "true");
  } else {
    window.localStorage.removeItem(AUTH_SESSION_KEY);
  }

  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

function setActiveUser(activeUser: ActiveUser | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (activeUser) {
    window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(activeUser));
  } else {
    window.localStorage.removeItem(AUTH_USER_KEY);
  }
}

function isFirebaseAuthError(error: unknown) {
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

function getStoredCredentials(): StoredCredential[] {
  if (typeof window === "undefined") {
    return [];
  }

  const rawValue = window.localStorage.getItem(USER_CREDENTIALS_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    return JSON.parse(rawValue) as StoredCredential[];
  } catch {
    return [];
  }
}

function saveStoredCredentials(credentials: StoredCredential[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(USER_CREDENTIALS_KEY, JSON.stringify(credentials));
}

function upsertStoredCredential(credential: StoredCredential) {
  const normalizedEmail = normalizeEmail(credential.email);
  const normalizedPhone = normalizePhone(credential.phone);
  const credentials = getStoredCredentials();
  const index = credentials.findIndex((item) => item.email === normalizedEmail);

  const nextCredential: StoredCredential = {
    ...credential,
    email: normalizedEmail,
    phone: normalizedPhone
  };

  if (index >= 0) {
    credentials[index] = { ...credentials[index], ...nextCredential };
  } else {
    credentials.push(nextCredential);
  }

  saveStoredCredentials(credentials);
}

function getStoredCredentialByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  return getStoredCredentials().find((credential) => credential.email === normalizedEmail) ?? null;
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

function getDeletedEmails(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  const rawValue = window.localStorage.getItem(DELETED_EMAILS_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    return JSON.parse(rawValue) as string[];
  } catch {
    return [];
  }
}

function saveDeletedEmails(emails: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(DELETED_EMAILS_KEY, JSON.stringify(emails));
}

function markEmailDeleted(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const deletedEmails = getDeletedEmails();

  if (!deletedEmails.includes(normalizedEmail)) {
    deletedEmails.push(normalizedEmail);
    saveDeletedEmails(deletedEmails);
  }
}

function clearDeletedEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  saveDeletedEmails(getDeletedEmails().filter((item) => item !== normalizedEmail));
}

function isEmailMarkedDeleted(email: string) {
  const normalizedEmail = normalizeEmail(email);
  return getDeletedEmails().includes(normalizedEmail);
}

function saveUserProfiles(profiles: UserProfile[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(USER_PROFILES_KEY, JSON.stringify(profiles));
}

function removeUserDataForEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);

  const remainingCredentials = getStoredCredentials().filter((credential) => credential.email !== normalizedEmail);
  saveStoredCredentials(remainingCredentials);

  const remainingProfiles = getStoredUserProfiles().filter((profile) => profile.email !== normalizedEmail);
  saveUserProfiles(remainingProfiles);
}

function clearAccountStorage(email: string) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedEmail = normalizeEmail(email);

  window.localStorage.removeItem(`milk-data-${normalizedEmail}`);
  window.localStorage.removeItem(`dairy-farm-profile-draft-${normalizedEmail}`);
  window.localStorage.removeItem(`customers-${normalizedEmail}`);

  // Current app data is stored in shared keys, so remove those too.
  window.localStorage.removeItem(PROFILE_DRAFT_KEY);
  window.localStorage.removeItem(CUSTOMER_LIST_KEY);
  window.localStorage.removeItem(CUSTOMER_SHEET_KEY);
  window.localStorage.removeItem(CUSTOMER_SHEET_HISTORY_KEY);
  window.localStorage.removeItem(AUTH_USER_KEY);
  window.localStorage.removeItem(AUTH_SESSION_KEY);
}

async function deleteFirebaseAccountForEmail(email: string) {
  if (!auth) {
    return;
  }

  const normalizedEmail = normalizeEmail(email);
  const storedCredential = getStoredCredentialByEmail(normalizedEmail);

  if (auth.currentUser?.email?.toLowerCase() !== normalizedEmail && storedCredential) {
    try {
      await signInWithEmailAndPassword(auth, normalizedEmail, storedCredential.password);
    } catch (error) {
      if (isFirebaseAuthError(error)) {
        return;
      }

      throw error;
    }
  }

  if (!auth.currentUser || auth.currentUser.email?.toLowerCase() !== normalizedEmail) {
    return;
  }

  try {
    await deleteUser(auth.currentUser);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("auth/requires-recent-login") ||
        error.message.includes("auth/user-token-expired") ||
        error.message.includes("auth/invalid-user-token"))
    ) {
      if (!storedCredential) {
        throw new Error("Please sign in again before deleting your account.");
      }

      try {
        await signInWithEmailAndPassword(auth, normalizedEmail, storedCredential.password);
      } catch (reauthError) {
        if (isFirebaseAuthError(reauthError)) {
          return;
        }

        throw reauthError;
      }

      if (!auth.currentUser) {
        throw new Error("Please sign in again before deleting your account.");
      }

      await deleteUser(auth.currentUser);
      return;
    }

    if (!isFirebaseAuthError(error)) {
      throw error;
    }
  }
}

function upsertUserProfile(profile: Omit<UserProfile, "updatedAt">) {
  const normalizedPhone = normalizePhone(profile.phone);
  const normalizedEmail = normalizeEmail(profile.email);
  const profiles = getStoredUserProfiles();
  const now = new Date().toISOString();
  const index = profiles.findIndex((item) => item.email === normalizedEmail || item.phone === normalizedPhone);

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
}

function syncAuthSession(activeUser: ActiveUser) {
  setOwnerSession(true);
  setActiveUser(activeUser);
}

function hydrateOwnerProfile() {
  upsertUserProfile({
    phone: OWNER_PHONE,
    email: OWNER_EMAIL,
    role: "owner",
    name: "Owner",
    farmName: "Raipur Dairy Farm",
    avatarUrl: ""
  });
}

export function getActiveUser(): ActiveUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(AUTH_USER_KEY);
  if (!rawValue) {
    if (isOwnerLoggedIn()) {
      return { phone: OWNER_PHONE, email: OWNER_EMAIL, role: "owner" };
    }
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as ActiveUser;
    if (!parsed.role || !parsed.email) {
      return null;
    }
    return {
      ...parsed,
      phone: parsed.phone ?? ""
    };
  } catch {
    return null;
  }
}

export function getCurrentUserProfile(): UserProfile | null {
  const activeUser = getActiveUser();
  if (!activeUser) {
    return null;
  }

  const storedCredential = getStoredCredentialByEmail(activeUser.email);

  const defaultProfile: UserProfile = {
    phone: activeUser.phone,
    email: activeUser.email,
    role: activeUser.role,
    name:
      activeUser.role === "owner"
        ? "Owner"
        : storedCredential?.name?.trim() || activeUser.email.split("@")[0] || "User",
    farmName: "",
    avatarUrl: "",
    updatedAt: new Date().toISOString()
  };

  const storedProfile = getStoredUserProfiles().find(
    (profile) => profile.phone === activeUser.phone || profile.email === activeUser.email
  );
  if (!storedProfile) {
    upsertUserProfile(defaultProfile);
    return defaultProfile;
  }

  return storedProfile;
}

function createProfileFromActiveUser(activeUser: ActiveUser): UserProfile {
  const fallbackName = activeUser.role === "owner" ? "Owner" : activeUser.email.split("@")[0] || "User";

  return {
    phone: activeUser.phone,
    email: activeUser.email,
    role: activeUser.role,
    name: fallbackName,
    farmName: activeUser.role === "owner" ? "Raipur Dairy Farm" : "",
    avatarUrl: "",
    updatedAt: new Date().toISOString()
  };
}

export function updateCurrentUserProfile(
  updates: Pick<UserProfile, "name" | "farmName" | "email" | "phone"> & { avatarUrl?: string }
): UserProfile | null {
  const currentProfile = getCurrentUserProfile();
  if (!currentProfile) {
    return null;
  }

  const activeUser = getActiveUser();
  const nextEmail = normalizeEmail(updates.email);
  const nextPhone = normalizePhone(updates.phone);
  const nextProfile: Omit<UserProfile, "updatedAt"> = {
    phone: nextPhone,
    email: nextEmail,
    role: currentProfile.role,
    name: updates.name.trim(),
    farmName: updates.farmName.trim(),
    avatarUrl: updates.avatarUrl !== undefined ? updates.avatarUrl : currentProfile.avatarUrl ?? ""
  };

  upsertUserProfile(nextProfile);

  if (activeUser) {
    setActiveUser({ ...activeUser, email: nextEmail });
  }

  const existingCredential = activeUser ? getStoredCredentialByEmail(activeUser.email) : null;
  if (existingCredential) {
    upsertStoredCredential({
      ...existingCredential,
      email: nextEmail,
      name: updates.name.trim(),
      phone: nextPhone
    });
  }

  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));

  return getCurrentUserProfile();
}

export function getAllUserProfiles(): UserProfile[] {
  return getStoredUserProfiles()
    .filter((profile) => profile.role === "user")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function subscribeAuthState(listener: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onChange = () => listener();
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === AUTH_SESSION_KEY ||
      event.key === AUTH_USER_KEY ||
      event.key === USER_PROFILES_KEY ||
      event.key === USER_CREDENTIALS_KEY
    ) {
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
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(AUTH_SESSION_KEY) === "true";
}

export async function signInWithEmailPassword(email: string, password: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  const trimmedPassword = password.trim();

  if (!normalizedEmail || !trimmedPassword) {
    throw new Error("Enter both email and password.");
  }

  if (isEmailMarkedDeleted(normalizedEmail)) {
    throw new Error("This account was deleted. Please create a new account.");
  }

  if (auth) {
    try {
      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, trimmedPassword);
      const role: "owner" | "user" = credential.user.email?.toLowerCase() === OWNER_EMAIL ? "owner" : "user";
      const storedProfile = getStoredUserProfiles().find((profile) => profile.email === normalizedEmail);
      const activeUser: ActiveUser = {
        email: normalizedEmail,
        phone: storedProfile?.phone ?? (role === "owner" ? OWNER_PHONE : ""),
        role
      };

      syncAuthSession(activeUser);

      if (!storedProfile) {
        upsertUserProfile(createProfileFromActiveUser(activeUser));
      }

      if (role === "owner") {
        hydrateOwnerProfile();
      }

      return;
    } catch (error) {
      if (!isFirebaseAuthError(error)) {
        const localCredential = getStoredCredentialByEmail(normalizedEmail);
        if (!localCredential || localCredential.password !== trimmedPassword) {
          throw error;
        }
      }
    }
  }

  const storedCredential = getStoredCredentialByEmail(normalizedEmail);
  if (!storedCredential || storedCredential.password !== trimmedPassword) {
    if (normalizedEmail === OWNER_EMAIL && trimmedPassword === OWNER_PASSWORD) {
      hydrateOwnerProfile();
      upsertStoredCredential({
        email: OWNER_EMAIL,
        password: OWNER_PASSWORD,
        name: "Owner",
        role: "owner",
        phone: OWNER_PHONE
      });
      syncAuthSession({ email: OWNER_EMAIL, phone: OWNER_PHONE, role: "owner" });
      return;
    }

    throw new Error("Invalid email or password.");
  }

  syncAuthSession({
    email: storedCredential.email,
    phone: storedCredential.phone,
    role: storedCredential.role
  });

  const storedProfile = getStoredUserProfiles().find((profile) => profile.email === storedCredential.email);

  upsertUserProfile({
    phone: storedCredential.phone,
    email: storedCredential.email,
    role: storedCredential.role,
    name: storedCredential.name || (storedCredential.email.split("@")[0] || "User"),
    farmName: storedCredential.role === "owner" ? "Raipur Dairy Farm" : "",
    avatarUrl: storedProfile?.avatarUrl ?? ""
  });
}

export async function signUpWithEmailPassword(
  email: string,
  password: string,
  name: string
): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  const trimmedPassword = password.trim();
  const trimmedName = name.trim();

  if (!normalizedEmail || !trimmedPassword) {
    throw new Error("Enter both email and password.");
  }

  if (normalizedEmail === OWNER_EMAIL) {
    throw new Error("This email is reserved for the owner.");
  }

  if (getStoredCredentialByEmail(normalizedEmail)) {
    throw new Error("Account already exists. Use Sign in.");
  }

  clearDeletedEmail(normalizedEmail);

  if (auth) {
    try {
      const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, trimmedPassword);
      syncAuthSession({
        email: credential.user.email ?? normalizedEmail,
        phone: "",
        role: "user"
      });
    } catch (error) {
      if (!isFirebaseAuthError(error)) {
        throw error;
      }
    }
  }

  upsertStoredCredential({
    email: normalizedEmail,
    password: trimmedPassword,
    name: trimmedName,
    role: "user",
    phone: ""
  });

  upsertUserProfile({
    phone: "",
    email: normalizedEmail,
    role: "user",
    name: trimmedName,
    farmName: "",
    avatarUrl: ""
  });

  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));

  syncAuthSession({
    email: normalizedEmail,
    phone: "",
    role: "user"
  });
}

export async function requestPasswordReset(email: string): Promise<"firebase" | "local"> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Enter an email address.");
  }

  if (normalizedEmail === OWNER_EMAIL) {
    throw new Error("Owner password reset is not available from this screen.");
  }

  const storedCredential = getStoredCredentialByEmail(normalizedEmail);

  if (auth) {
    try {
      await sendPasswordResetEmail(auth, normalizedEmail);
      return "firebase";
    } catch (error) {
      if (!storedCredential || !isFirebaseAuthError(error)) {
        if (!storedCredential) {
          throw error;
        }
      }
    }
  }

  if (!storedCredential) {
    throw new Error("Account not found.");
  }

  return "local";
}

export async function completeLocalPasswordReset(email: string, password: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  const trimmedPassword = password.trim();

  if (!normalizedEmail || !trimmedPassword) {
    throw new Error("Enter a new password.");
  }

  if (normalizedEmail === OWNER_EMAIL) {
    throw new Error("Owner password cannot be changed here.");
  }

  const storedCredential = getStoredCredentialByEmail(normalizedEmail);
  if (!storedCredential) {
    throw new Error("Account not found.");
  }

  upsertStoredCredential({
    ...storedCredential,
    password: trimmedPassword
  });

  const storedProfile = getStoredUserProfiles().find((profile) => profile.email === normalizedEmail);
  if (storedProfile) {
    upsertUserProfile({
      phone: storedProfile.phone,
      email: storedProfile.email,
      role: storedProfile.role,
      name: storedProfile.name,
      farmName: storedProfile.farmName
    });
  }

  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export async function logout(): Promise<void> {
  setOwnerSession(false);
  setActiveUser(null);

  if (!auth) {
    return;
  }

  try {
    await signOut(auth);
  } catch {
    // Allow local logout to succeed even if Firebase sign out fails.
  }
}

export async function deleteCurrentAccount(): Promise<void> {
  const activeUser = getActiveUser();
  if (!activeUser) {
    throw new Error("No account is currently signed in.");
  }

  if (activeUser.email === OWNER_EMAIL) {
    throw new Error("Owner account cannot be deleted from here.");
  }

  const normalizedEmail = normalizeEmail(activeUser.email);

  try {
    await deleteFirebaseAccountForEmail(normalizedEmail);
  } catch (error) {
    console.error("Firebase account deletion failed:", error);
    throw error instanceof Error ? error : new Error("Failed to delete Firebase account.");
  }

  try {
    // Mark email as deleted (prevents re-registration)
    markEmailDeleted(normalizedEmail);
    
    // Remove all user data from localStorage
    removeUserDataForEmail(normalizedEmail);

    clearAccountStorage(normalizedEmail);
    
    // Emit auth change event
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
    }

    // Sign out from Firebase
    if (auth) {
      try {
        await signOut(auth);
      } catch {
        console.warn("Firebase sign out failed");
      }
    }
  } catch (error) {
    console.error("Error during account deletion:", error);
    throw new Error("Failed to delete account completely. Some data may remain.");
  }
}

export async function deleteUserByEmail(email: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new Error("Invalid email address.");
  }

  if (normalizedEmail === OWNER_EMAIL) {
    throw new Error("Owner account cannot be deleted.");
  }

  const storedCredential = getStoredCredentialByEmail(normalizedEmail);
  if (!storedCredential) {
    throw new Error("User not found.");
  }

  if (auth) {
    try {
      await deleteFirebaseAccountForEmail(normalizedEmail);
    } catch {
      // Continue with local deletion for owner-managed cleanup when Firebase deletion is unavailable.
    }
  }

  markEmailDeleted(normalizedEmail);
  removeUserDataForEmail(normalizedEmail);
  clearAccountStorage(normalizedEmail);

  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}
