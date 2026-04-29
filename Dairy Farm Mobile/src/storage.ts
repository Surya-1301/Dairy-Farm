import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Customer, SheetHistoryEntry, SheetRow, SheetState } from "./types";

const CUSTOMERS_KEY = "dairy-farm-customers";
const SHEET_KEY = "dairy-farm-customer-sheet";
const HISTORY_KEY = "dairy-farm-customer-sheet-history";
const INITIAL_ROWS = 20;
const INITIAL_DAYS = 15;

function createEmptyRow(serialNumber: number, dayCount: number): SheetRow {
  return {
    serialNumber,
    customerName: "",
    days: Array.from({ length: dayCount }, () => 0)
  };
}

export function createInitialSheet(): SheetState {
  return {
    dayCount: INITIAL_DAYS,
    rows: Array.from({ length: INITIAL_ROWS }, (_, index) => createEmptyRow(index + 1, INITIAL_DAYS))
  };
}

function normalizeRows(rows: SheetRow[], dayCount: number) {
  return rows.map((row, index) => ({
    serialNumber: index + 1,
    customerName: row.customerName ?? "",
    days: Array.from({ length: dayCount }, (_, dayIndex) => row.days?.[dayIndex] ?? 0)
  }));
}

export async function getCustomers(): Promise<Customer[]> {
  const stored = await AsyncStorage.getItem(CUSTOMERS_KEY);
  if (!stored) {
    return [];
  }

  try {
    const customers = JSON.parse(stored) as Customer[];
    return customers.map((customer, index) => ({ ...customer, serialNumber: index + 1 }));
  } catch {
    return [];
  }
}

export async function saveCustomers(customers: Customer[]) {
  const normalized = customers.map((customer, index) => ({ ...customer, serialNumber: index + 1 }));
  await AsyncStorage.setItem(CUSTOMERS_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function getSheet(): Promise<SheetState> {
  const stored = await AsyncStorage.getItem(SHEET_KEY);
  if (!stored) {
    return createInitialSheet();
  }

  try {
    const parsed = JSON.parse(stored) as SheetState | SheetRow[];
    if (Array.isArray(parsed)) {
      return { dayCount: INITIAL_DAYS, rows: normalizeRows(parsed, INITIAL_DAYS) };
    }

    if (parsed && Array.isArray(parsed.rows) && typeof parsed.dayCount === "number") {
      return { dayCount: parsed.dayCount, rows: normalizeRows(parsed.rows, parsed.dayCount) };
    }
  } catch {
    return createInitialSheet();
  }

  return createInitialSheet();
}

export async function saveSheet(sheet: SheetState) {
  await AsyncStorage.setItem(SHEET_KEY, JSON.stringify(sheet));
  return sheet;
}

export async function syncSheetCustomerNames(customers: Customer[]) {
  const sheet = await getSheet();
  const rows = sheet.rows.map((row) => {
    const customer = customers.find((item) => item.serialNumber === row.serialNumber);
    return customer?.name ? { ...row, customerName: customer.name } : row;
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
  const stored = await AsyncStorage.getItem(HISTORY_KEY);
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as SheetHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function archiveSheet(sheet: SheetState) {
  const history = await getHistory();
  const entry: SheetHistoryEntry = {
    ...sheet,
    id: `history-${Date.now()}`,
    savedAt: new Date().toISOString()
  };
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...history]));
  return saveSheet(createInitialSheet());
}
