import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db, normalizeEmail } from "./firebase";
import type { Customer, SheetHistoryEntry, SheetRow, SheetState } from "./types";
import { createDefaultSheet } from "./utils/defaultSheet";

const CUSTOMER_LISTS_COLLECTION = "customerLists";
const SHEET_STATES_COLLECTION = "sheetStates";
const SHEET_HISTORIES_COLLECTION = "sheetHistories";

function requireActiveUserEmail() {
  const email = normalizeEmail(auth.currentUser?.email ?? "");
  if (!email) {
    throw new Error("No account is signed in.");
  }

  return email;
}

function normalizeRows(rows: SheetRow[], dayCount: number) {
  return rows.map((row, index) => ({
    serialNumber: index + 1,
    customerName: row.customerName ?? "",
    shift: row.shift ?? "",
    days: Array.from({ length: dayCount }, (_, dayIndex) => row.days?.[dayIndex] ?? 0)
  }));
}

function loadDefaultSheet(): SheetState {
  return createDefaultSheet();
}

export async function getCustomers(): Promise<Customer[]> {
  const email = requireActiveUserEmail();
  const snapshot = await getDoc(doc(db, CUSTOMER_LISTS_COLLECTION, email));
  if (!snapshot.exists()) {
    return [];
  }

  try {
    const data = snapshot.data() as { customers?: Customer[] };
    const customers = data.customers ?? [];
    return customers.map((customer, index) => ({ ...customer, serialNumber: index + 1 }));
  } catch {
    return [];
  }
}

export async function saveCustomers(customers: Customer[]) {
  const email = requireActiveUserEmail();
  const normalized = customers.map((customer, index) => ({ ...customer, serialNumber: index + 1 }));
  await setDoc(
    doc(db, CUSTOMER_LISTS_COLLECTION, email),
    { customers: normalized, updatedAt: new Date().toISOString() },
    { merge: true }
  );
  return normalized;
}

export async function getSheet(): Promise<SheetState> {
  const email = requireActiveUserEmail();
  const snapshot = await getDoc(doc(db, SHEET_STATES_COLLECTION, email));
  if (!snapshot.exists()) {
    return loadDefaultSheet();
  }

  try {
    const parsed = snapshot.data() as SheetState | SheetRow[];
    if (Array.isArray(parsed)) {
      const defaultSheet = await loadDefaultSheet();
      return { dayCount: defaultSheet.dayCount, rows: normalizeRows(parsed, defaultSheet.dayCount) };
    }

    if (parsed && Array.isArray(parsed.rows) && typeof parsed.dayCount === "number") {
      const dayCount = Math.max(loadDefaultSheet().dayCount, parsed.dayCount);
      return { dayCount, rows: normalizeRows(parsed.rows, dayCount) };
    }
  } catch {
    return loadDefaultSheet();
  }

  return loadDefaultSheet();
}

export function subscribeSheet(callback: (sheet: SheetState) => void): () => void {
  let email: string;
  try {
    email = requireActiveUserEmail();
  } catch {
    return () => {};
  }

  const docRef = doc(db, SHEET_STATES_COLLECTION, email);
  return onSnapshot(docRef, (snapshot) => {
    if (!snapshot.exists() || snapshot.metadata.hasPendingWrites) return;

    try {
      const parsed = snapshot.data() as SheetState | SheetRow[];
      if (Array.isArray(parsed)) {
        const defaultSheet = loadDefaultSheet();
        callback({ dayCount: defaultSheet.dayCount, rows: normalizeRows(parsed, defaultSheet.dayCount) });
        return;
      }
      if (parsed && Array.isArray(parsed.rows) && typeof parsed.dayCount === "number") {
        const dayCount = Math.max(loadDefaultSheet().dayCount, parsed.dayCount);
        callback({ dayCount, rows: normalizeRows(parsed.rows, dayCount) });
        return;
      }
    } catch {
      // ignore parse errors
    }

    callback(loadDefaultSheet());
  });
}

export async function saveSheet(sheet: SheetState) {
  const email = requireActiveUserEmail();
  await setDoc(doc(db, SHEET_STATES_COLLECTION, email), { ...sheet, updatedAt: new Date().toISOString() }, { merge: true });
  return sheet;
}

export async function syncSheetCustomerNames(customers: Customer[]) {
  const sheet = await getSheet();
  const rows = sheet.rows.map((row) => {
    const customer = customers.find((item) => item.serialNumber === row.serialNumber);
    if (customer?.name) {
      return { ...row, customerName: customer.name, shift: customer.shift || row.shift };
    }
    return row;
  });
  return saveSheet({ ...sheet, rows });
}

export async function deleteSheetRow(serialNumber: number) {
  const sheet = await getSheet();
  const rows = sheet.rows
    .filter((row) => row.serialNumber !== serialNumber)
    .map((row, index) => ({ ...row, serialNumber: index + 1 }));
  await saveSheet({ ...sheet, rows });
}

export async function getHistory(): Promise<SheetHistoryEntry[]> {
  const email = requireActiveUserEmail();
  const snapshot = await getDoc(doc(db, SHEET_HISTORIES_COLLECTION, email));
  if (!snapshot.exists()) {
    return [];
  }

  try {
    const data = snapshot.data() as { entries?: SheetHistoryEntry[] };
    const parsed = data.entries ?? [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function archiveSheet(sheet: SheetState) {
  const email = requireActiveUserEmail();
  const history = await getHistory();
  const entry: SheetHistoryEntry = {
    ...sheet,
    id: `history-${Date.now()}`,
    savedAt: new Date().toISOString()
  };
  await setDoc(
    doc(db, SHEET_HISTORIES_COLLECTION, email),
    { entries: [entry, ...history], updatedAt: new Date().toISOString() },
    { merge: true }
  );
  return saveSheet(await loadDefaultSheet());
}

export async function deleteHistoryEntry(entryId: string) {
  const email = requireActiveUserEmail();
  const history = await getHistory();
  const filtered = history.filter(entry => entry.id !== entryId);
  await setDoc(
    doc(db, SHEET_HISTORIES_COLLECTION, email),
    { entries: filtered, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

export async function getCustomersByEmail(email: string): Promise<Customer[]> {
  const normalizedEmail = normalizeEmail(email);
  const snapshot = await getDoc(doc(db, CUSTOMER_LISTS_COLLECTION, normalizedEmail));
  if (!snapshot.exists()) return [];
  try {
    const data = snapshot.data() as { customers?: Customer[] };
    const customers = data.customers ?? [];
    return customers.map((customer, index) => ({ ...customer, serialNumber: index + 1 }));
  } catch {
    return [];
  }
}

export async function getSheetByEmail(email: string): Promise<SheetState> {
  const normalizedEmail = normalizeEmail(email);
  const snapshot = await getDoc(doc(db, SHEET_STATES_COLLECTION, normalizedEmail));
  if (!snapshot.exists()) return createDefaultSheet();
  try {
    const parsed = snapshot.data() as SheetState | SheetRow[];
    if (Array.isArray(parsed)) {
      const defaultSheet = createDefaultSheet();
      return { dayCount: defaultSheet.dayCount, rows: normalizeRows(parsed, defaultSheet.dayCount) };
    }
    if (parsed && Array.isArray(parsed.rows) && typeof parsed.dayCount === "number") {
      const dayCount = Math.max(createDefaultSheet().dayCount, parsed.dayCount);
      return { dayCount, rows: normalizeRows(parsed.rows, dayCount) };
    }
  } catch {
    return createDefaultSheet();
  }
  return createDefaultSheet();
}
