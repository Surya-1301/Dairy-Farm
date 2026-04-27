import { ConfirmationResult, RecaptchaVerifier, signInWithPhoneNumber, signOut } from "firebase/auth";
import { auth } from "./config";

const OWNER_PHONE = "9999999999";
const OWNER_EMAIL = "owner@dairyfarm.com";
const AUTH_SESSION_KEY = "dairy-farm-owner-session";
const AUTH_USER_KEY = "dairy-farm-active-user";
const USER_PROFILES_KEY = "dairy-farm-user-profiles";
const AUTH_CHANGE_EVENT = "dairy-farm-auth-changed";

type AuthMode = "signin" | "signup";

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
  updatedAt: string;
};

function normalizePhone(rawValue: string) {
  return rawValue.replace(/\D/g, "");
}

let recaptchaVerifier: RecaptchaVerifier | null = null;
let confirmationResult: ConfirmationResult | null = null;
let pendingPhone: string | null = null;
let fallbackOtpPhone: string | null = null;
let fallbackOtpCode: string | null = null;
let lastOtpMode: "firebase" | "fallback" = "firebase";

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

function getRecaptchaVerifier() {
  if (!auth) {
    throw new Error("Phone authentication is unavailable. Check Firebase config.");
  }

  if (!recaptchaVerifier) {
    recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
      size: "normal"
    });
  }

  return recaptchaVerifier;
}

function isFirebasePhoneConfigError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("auth/configuration-not-found") ||
    error.message.includes("auth/operation-not-allowed")
  );
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

function upsertUserProfile(profile: Omit<UserProfile, "updatedAt">) {
  const normalizedPhone = normalizePhone(profile.phone);
  const normalizedEmail = profile.email.trim().toLowerCase();
  const profiles = getStoredUserProfiles();
  const now = new Date().toISOString();
  const index = profiles.findIndex((item) => item.phone === normalizedPhone);

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
    if (!parsed.phone || !parsed.role) {
      return null;
    }
    return { ...parsed, email: parsed.email ?? "" };
  } catch {
    return null;
  }
}

export function getCurrentUserProfile(): UserProfile | null {
  const activeUser = getActiveUser();
  if (!activeUser) {
    return null;
  }

  const defaultProfile: UserProfile = {
    phone: activeUser.phone,
    email: activeUser.email,
    role: activeUser.role,
    name: activeUser.role === "owner" ? "Owner" : "",
    farmName: "",
    updatedAt: new Date().toISOString()
  };

  const storedProfile = getStoredUserProfiles().find((profile) => profile.phone === activeUser.phone);
  if (!storedProfile) {
    upsertUserProfile(defaultProfile);
    return defaultProfile;
  }

  return storedProfile;
}

export function updateCurrentUserProfile(
  updates: Pick<UserProfile, "name" | "farmName" | "email">
): UserProfile | null {
  const currentProfile = getCurrentUserProfile();
  if (!currentProfile) {
    return null;
  }

  const nextProfile: Omit<UserProfile, "updatedAt"> = {
    phone: currentProfile.phone,
    email: updates.email.trim().toLowerCase(),
    role: currentProfile.role,
    name: updates.name.trim(),
    farmName: updates.farmName.trim()
  };

  upsertUserProfile(nextProfile);
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
    if (event.key === AUTH_SESSION_KEY || event.key === AUTH_USER_KEY || event.key === USER_PROFILES_KEY) {
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

export async function requestOtpForPhone(phone: string, mode: AuthMode): Promise<void> {
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone.length !== 10) {
    throw new Error("Enter a valid 10-digit mobile number.");
  }

  const existingProfile = getStoredUserProfiles().find((profile) => profile.phone === normalizedPhone);
  const isOwner = normalizedPhone === OWNER_PHONE;

  if (mode === "signup" && existingProfile && !isOwner) {
    throw new Error("Account already exists. Use Sign in.");
  }
  if (mode === "signin" && !existingProfile && !isOwner) {
    throw new Error("User not found. Please sign up first.");
  }

  try {
    const verifier = getRecaptchaVerifier();
    await verifier.render();
    confirmationResult = await signInWithPhoneNumber(auth!, `+91${normalizedPhone}`, verifier);
    pendingPhone = normalizedPhone;
    fallbackOtpPhone = null;
    fallbackOtpCode = null;
    lastOtpMode = "firebase";
  } catch (error) {
    if (!isFirebasePhoneConfigError(error)) {
      throw error;
    }

    // Graceful fallback for projects where Phone Auth is not enabled yet.
    fallbackOtpPhone = normalizedPhone;
    fallbackOtpCode = "123456";
    confirmationResult = null;
    pendingPhone = normalizedPhone;
    lastOtpMode = "fallback";
  }
}

export function getLastOtpMode() {
  return lastOtpMode;
}

export async function verifyOtpAndAuthenticate(phone: string, otp: string, mode: AuthMode): Promise<void> {
  const normalizedPhone = normalizePhone(phone);
  const inputOtp = otp.trim();

  if (normalizedPhone.length !== 10) {
    throw new Error("Enter a valid 10-digit mobile number.");
  }

  if (pendingPhone !== normalizedPhone) {
    throw new Error("Please request OTP again.");
  }

  const existingProfile = getStoredUserProfiles().find((profile) => profile.phone === normalizedPhone);
  const isOwner = normalizedPhone === OWNER_PHONE;

  if (mode === "signup" && existingProfile && !isOwner) {
    throw new Error("Account already exists. Use Sign in.");
  }
  if (mode === "signin" && !existingProfile && !isOwner) {
    throw new Error("User not found. Please sign up first.");
  }

  if (confirmationResult) {
    try {
      await confirmationResult.confirm(inputOtp);
    } catch {
      throw new Error("Invalid OTP.");
    }
  } else {
    if (fallbackOtpPhone !== normalizedPhone || fallbackOtpCode !== inputOtp) {
      throw new Error("Invalid OTP.");
    }
  }

  if (isOwner) {
    setOwnerSession(true);
    setActiveUser({ phone: OWNER_PHONE, email: OWNER_EMAIL, role: "owner" });
    upsertUserProfile({
      phone: OWNER_PHONE,
      email: OWNER_EMAIL,
      role: "owner",
      name: "Owner",
      farmName: "Raipur Dairy Farm"
    });
  } else {
    const existingEmail = existingProfile?.email ?? "";
    const existingName = existingProfile?.name ?? "";
    const existingFarmName = existingProfile?.farmName ?? "";

    setOwnerSession(true);
    setActiveUser({ phone: normalizedPhone, email: existingEmail, role: "user" });
    upsertUserProfile({
      phone: normalizedPhone,
      email: existingEmail,
      role: "user",
      name: existingName,
      farmName: existingFarmName
    });
  }
  confirmationResult = null;
  pendingPhone = null;
  fallbackOtpPhone = null;
  fallbackOtpCode = null;
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
