import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import { auth } from "./config";

const OWNER_EMAIL = "owner@dairyfarm.com";
const OWNER_PASSWORD = "123456";
const AUTH_SESSION_KEY = "dairy-farm-owner-session";
const LOCAL_USERS_KEY = "dairy-farm-local-users";
const AUTH_CHANGE_EVENT = "dairy-farm-auth-changed";

type LocalUser = {
  email: string;
  password: string;
};

function getLocalUsers(): LocalUser[] {
  if (typeof window === "undefined") {
    return [];
  }

  const rawValue = window.localStorage.getItem(LOCAL_USERS_KEY);

  if (!rawValue) {
    return [];
  }

  try {
    return JSON.parse(rawValue) as LocalUser[];
  } catch {
    return [];
  }
}

function saveLocalUsers(users: LocalUser[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

function findLocalUser(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return getLocalUsers().find((user) => user.email === normalizedEmail);
}

function createLocalUser(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const users = getLocalUsers();

  if (users.some((user) => user.email === normalizedEmail)) {
    throw new Error("Account already exists.");
  }

  users.push({ email: normalizedEmail, password });
  saveLocalUsers(users);
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

export function subscribeAuthState(listener: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onChange = () => listener();
  const onStorage = (event: StorageEvent) => {
    if (event.key === AUTH_SESSION_KEY) {
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

export async function signupWithEmail(email: string, password: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedEmail === OWNER_EMAIL) {
    throw new Error("Owner email is reserved. Use a different email.");
  }

  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  try {
    if (!auth) {
      throw new Error("Firebase Auth is unavailable.");
    }

    await createUserWithEmailAndPassword(auth, normalizedEmail, password);
  } catch {
    createLocalUser(normalizedEmail, password);
  }

  setOwnerSession(true);
}

export async function loginWithEmail(email: string, password: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedEmail === OWNER_EMAIL && password === OWNER_PASSWORD) {
    setOwnerSession(true);
    return;
  }

  const localUser = findLocalUser(normalizedEmail);

  if (localUser && localUser.password === password) {
    setOwnerSession(true);
    return;
  }

  if (!auth) {
    throw new Error("Invalid email or password.");
  }

  try {
    await signInWithEmailAndPassword(auth, normalizedEmail, password);
    setOwnerSession(true);
  } catch {
    throw new Error("Invalid email or password.");
  }
}

export async function logout(): Promise<void> {
  setOwnerSession(false);

  if (!auth) {
    return;
  }

  try {
    await signOut(auth);
  } catch {
    // Allow local owner logout to succeed even without Firebase session.
  }
}
