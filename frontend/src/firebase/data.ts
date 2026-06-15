import { deleteDoc, doc, getDoc, getDocs, setDoc, collection } from "firebase/firestore";
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
};

export type SheetHistoryEntry = SheetState & {
  id: string;
  savedAt: string;
};

const INITIAL_ROWS = 50;
const INITIAL_DAYS = 15;

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

export async function getCustomersByEmail(email: string): Promise<Customer[]> {
  if (!db) {
    return [];
  }

  const snapshot = await getDoc(doc(db, CUSTOMER_LISTS_COLLECTION, normalizeEmail(email)));
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

export async function getSheetByEmail(email: string): Promise<SheetState> {
  if (!db) {
    return createInitialSheet();
  }

  const snapshot = await getDoc(doc(db, SHEET_STATES_COLLECTION, normalizeEmail(email)));
  if (!snapshot.exists()) {
    return createInitialSheet();
  }

  const data = snapshot.data() as Partial<SheetState>;
  const dayCount = typeof data.dayCount === "number" && data.dayCount > 0 ? data.dayCount : INITIAL_DAYS;
  const rows = Array.isArray(data.rows) ? normalizeRows(data.rows, dayCount) : createInitialSheet().rows;

  return { dayCount, rows };
}

export async function saveSheetByEmail(email: string, sheet: SheetState): Promise<SheetState> {
  if (!db) {
    return sheet;
  }

  const normalized: SheetState = {
    dayCount: sheet.dayCount,
    rows: normalizeRows(sheet.rows, sheet.dayCount)
  };

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

export async function archiveSheetByEmail(email: string, sheet: SheetState): Promise<SheetState> {
  const history = await getHistoryByEmail(email);
  const entry: SheetHistoryEntry = {
    ...sheet,
    id: `history-${Date.now()}`,
    savedAt: new Date().toISOString()
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
