import { deleteDoc, doc, getDoc, getDocFromServer, getDocs, setDoc, collection, onSnapshot } from "firebase/firestore";
import { db } from "./config";

export type Customer = {
  serialNumber: number;
  name: string;
  mobile: string;
  address: string;
  shift: string;
  createdAt: string;
};

export type SheetRow = {
  serialNumber: number;
  customerName: string;
  shift: string;
  days: number[];
};

export type SheetState = {
  dayCount: number;
  rows: SheetRow[];
  updatedAt?: string;
};

export type SheetHistoryEntry = SheetState & {
  id: string;
  savedAt: string;
  name?: string;
};

const INITIAL_ROWS = 50;
const INITIAL_DAYS = 16;

const CUSTOMER_LISTS_COLLECTION = "customerLists";
const SHEET_STATES_COLLECTION = "sheetStates";
const SHEET_HISTORIES_COLLECTION = "sheetHistories";

export function normalizeEmail(rawValue: string) {
  return rawValue.trim().toLowerCase();
}

function createEmptyRow(serialNumber: number, dayCount: number): SheetRow {
  return {
    serialNumber,
    customerName: "",
    shift: "",
    days: Array.from({ length: dayCount }, () => 0)
  };
}

export function createInitialSheet(): SheetState {
  return {
    dayCount: INITIAL_DAYS,
    rows: Array.from({ length: INITIAL_ROWS }, (_, index) => createEmptyRow(index + 1, INITIAL_DAYS))
  };
}

function normalizeRows(rows: SheetRow[], dayCount: number): SheetRow[] {
  return rows.map((row, index) => ({
    serialNumber: index + 1,
    customerName: row.customerName ?? "",
    shift: row.shift ?? "",
    days: Array.from({ length: dayCount }, (_, dayIndex) => row.days?.[dayIndex] ?? 0)
  }));
}

function normalizeSheetState(sheet: SheetState): SheetState {
  return {
    dayCount: sheet.dayCount,
    rows: normalizeRows(sheet.rows, sheet.dayCount)
  };
}

function cloneSheetState(sheet: SheetState): SheetState {
  return {
    dayCount: sheet.dayCount,
    rows: sheet.rows.map((row) => ({
      ...row,
      days: [...row.days]
    }))
  };
}

function normalizeCustomers(customers: Customer[]): Customer[] {
  return customers.map((customer, index) => ({
    serialNumber: index + 1,
    name: customer.name ?? "",
    mobile: customer.mobile ?? "",
    address: customer.address ?? "",
    shift: customer.shift ?? "",
    createdAt: customer.createdAt ?? new Date().toISOString()
  }));
}

export async function getCustomersByEmail(email: string, forceServer = false): Promise<Customer[]> {
  if (!db) {
    return [];
  }

  const ref = doc(db, CUSTOMER_LISTS_COLLECTION, normalizeEmail(email));
  const snapshot = await (forceServer ? getDocFromServer(ref) : getDoc(ref));
  if (!snapshot.exists()) {
    return [];
  }

  const data = snapshot.data() as { customers?: Customer[] };
  return normalizeCustomers(data.customers ?? []);
}

export async function saveCustomersByEmail(email: string, customers: Customer[]): Promise<Customer[]> {
  if (!db) {
    return normalizeCustomers(customers);
  }

  const normalizedCustomers = normalizeCustomers(customers);
  await setDoc(
    doc(db, CUSTOMER_LISTS_COLLECTION, normalizeEmail(email)),
    { customers: normalizedCustomers, updatedAt: new Date().toISOString() },
    { merge: true }
  );

  return normalizedCustomers;
}

export async function getSheetByEmail(email: string, forceServer = false): Promise<SheetState> {
  if (!db) {
    return createInitialSheet();
  }

  const ref = doc(db, SHEET_STATES_COLLECTION, normalizeEmail(email));
  const snapshot = await (forceServer ? getDocFromServer(ref) : getDoc(ref));
  if (!snapshot.exists()) {
    return createInitialSheet();
  }

  const data = snapshot.data() as Partial<SheetState> & { updatedAt?: string };
  const rawDayCount = typeof data.dayCount === "number" && data.dayCount > 0 ? data.dayCount : INITIAL_DAYS;
  const dayCount = Math.max(INITIAL_DAYS, rawDayCount);
  const rows = Array.isArray(data.rows) ? normalizeRows(data.rows, dayCount) : createInitialSheet().rows;

  return { dayCount, rows, updatedAt: data.updatedAt };
}

export function subscribeSheetByEmail(email: string, callback: (sheet: SheetState) => void): () => void {
  if (!db) return () => {};

  const docRef = doc(db, SHEET_STATES_COLLECTION, normalizeEmail(email));
  return onSnapshot(docRef, (snapshot) => {
    if (!snapshot.exists() || snapshot.metadata.hasPendingWrites) return;

    const data = snapshot.data() as Partial<SheetState>;
    const rawDayCount = typeof data.dayCount === "number" && data.dayCount > 0 ? data.dayCount : INITIAL_DAYS;
    const dayCount = Math.max(INITIAL_DAYS, rawDayCount);
    const rows = Array.isArray(data.rows) ? normalizeRows(data.rows, dayCount) : createInitialSheet().rows;
    callback({ dayCount, rows });
  });
}

export async function saveSheetByEmail(email: string, sheet: SheetState): Promise<SheetState> {
  if (!db) {
    return normalizeSheetState(sheet);
  }

  const normalized = normalizeSheetState(sheet);

  await setDoc(
    doc(db, SHEET_STATES_COLLECTION, normalizeEmail(email)),
    { ...normalized, updatedAt: new Date().toISOString() },
    { merge: true }
  );

  return normalized;
}

export async function getHistoryByEmail(email: string): Promise<SheetHistoryEntry[]> {
  if (!db) {
    return [];
  }

  const snapshot = await getDoc(doc(db, SHEET_HISTORIES_COLLECTION, normalizeEmail(email)));
  if (!snapshot.exists()) {
    return [];
  }

  const data = snapshot.data() as { entries?: SheetHistoryEntry[] };
  return Array.isArray(data.entries) ? data.entries : [];
}

export async function saveHistoryByEmail(email: string, entries: SheetHistoryEntry[]): Promise<SheetHistoryEntry[]> {
  if (!db) {
    return entries;
  }

  await setDoc(
    doc(db, SHEET_HISTORIES_COLLECTION, normalizeEmail(email)),
    { entries, updatedAt: new Date().toISOString() },
    { merge: true }
  );

  return entries;
}

export async function archiveSheetByEmail(email: string, sheet: SheetState, name = ""): Promise<SheetState> {
  const history = await getHistoryByEmail(email);
  const archivedSheet = cloneSheetState(sheet);
  const entry: SheetHistoryEntry = {
    ...archivedSheet,
    id: `history-${Date.now()}`,
    savedAt: new Date().toISOString(),
    name: name.trim() || `Sheet ${history.length + 1}`
  };

  await saveHistoryByEmail(email, [entry, ...history]);
  return saveSheetByEmail(email, createInitialSheet());
}

export async function deleteUserDataByEmail(email: string): Promise<void> {
  if (!db) {
    return;
  }

  const normalizedEmail = normalizeEmail(email);

  await Promise.all([
    deleteDoc(doc(db, CUSTOMER_LISTS_COLLECTION, normalizedEmail)),
    deleteDoc(doc(db, SHEET_STATES_COLLECTION, normalizedEmail)),
    deleteDoc(doc(db, SHEET_HISTORIES_COLLECTION, normalizedEmail))
  ]);
}

export async function getAllSheets(): Promise<Array<{ email: string; sheet: SheetState }>> {
  if (!db) {
    return [];
  }

  const snapshot = await getDocs(collection(db, SHEET_STATES_COLLECTION));
  return snapshot.docs.map((item) => {
    const data = item.data() as Partial<SheetState>;
    const dayCount = typeof data.dayCount === "number" && data.dayCount > 0 ? data.dayCount : INITIAL_DAYS;
    const rows = Array.isArray(data.rows) ? normalizeRows(data.rows, dayCount) : [];

    return {
      email: item.id,
      sheet: { dayCount, rows }
    };
  });
}

const PASSWORD_RESETS_COLLECTION = "passwordResets";

export async function savePasswordResetOtp(email: string, otp: string, validityMs: number): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, PASSWORD_RESETS_COLLECTION, normalizeEmail(email)), {
    otp,
    expiresAt: new Date(Date.now() + validityMs).toISOString()
  });
}

export async function verifyPasswordResetOtp(email: string, otp: string): Promise<boolean> {
  if (!db) return false;
  const snapshot = await getDoc(doc(db, PASSWORD_RESETS_COLLECTION, normalizeEmail(email)));
  if (!snapshot.exists()) return false;
  const data = snapshot.data() as { otp: string; expiresAt: string };
  if (new Date(data.expiresAt) < new Date()) return false;
  return data.otp === otp;
}

export async function clearPasswordResetOtp(email: string): Promise<void> {
  if (!db) return;
  await deleteDoc(doc(db, PASSWORD_RESETS_COLLECTION, normalizeEmail(email)));
}
