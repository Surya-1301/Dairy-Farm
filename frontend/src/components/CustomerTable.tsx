import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import { getCustomers, subscribeCustomersChanged, notifyCustomersChanged } from "../utils/customerData";
import { notifyMilkDataChanged } from "../utils/milkData";

import { getActiveUser } from "../firebase/auth";
import {
  archiveSheetByEmail,
  createInitialSheet,
  getHistoryByEmail,
  getSheetByEmail,
  saveHistoryByEmail,
  saveSheetByEmail,
  saveSheetToHistoryByEmail,
  subscribeHistoryByEmail,
  subscribeSheetByEmail,
  saveCustomersByEmail,
  type SheetHistoryEntry,
  type SheetState,
  type SheetRow,
  type Customer
} from "../firebase/data";

const INITIAL_DAYS = 16;

// Group a customer's shift records together by name, regardless of their position
// in the underlying list (a customer's Morning/Evening records are not always adjacent).
function groupCustomersByName(customers: Customer[]): Customer[][] {
  const groups: Customer[][] = [];
  const groupIndexByKey = new Map<string, number>();

  for (const customer of customers) {
    const key = customer.name.trim().toLowerCase();
    const existingIndex = key ? groupIndexByKey.get(key) : undefined;

    if (existingIndex !== undefined) {
      groups[existingIndex].push(customer);
    } else {
      if (key) {
        groupIndexByKey.set(key, groups.length);
      }
      groups.push([customer]);
    }
  }

  return groups;
}

// Both-shift customers first, then Morning-only, then Evening-only — matches the
// ordering shown on the Customers page.
function getGroupShiftPriority(group: Customer[]): number {
  if (group.length > 1) return 0;
  if (group[0].shift === "M") return 1;
  if (group[0].shift === "E") return 2;
  return 3;
}

function sortCustomerGroups(groups: Customer[][]): Customer[][] {
  return [...groups].sort((a, b) => {
    return a[0].serialNumber - b[0].serialNumber;
  });
}

function getOrderedCustomers(customers: Customer[]): Customer[] {
  return sortCustomerGroups(groupCustomersByName(customers)).flat();
}

function buildDisplaySerialMap(rows: SheetRow[]): string[] {
  const serialByCustomer = new Map<string, number>();
  let nextSerial = 1;

  return rows.map((row) => {
    const key = row.customerName.trim().toLowerCase();

    if (!key) {
      return String(row.serialNumber);
    }

    if (serialByCustomer.has(key)) {
      return "";
    }

    serialByCustomer.set(key, nextSerial);
    nextSerial += 1;
    return String(nextSerial - 1);
  });
}

function buildGroupStartIndices(rows: SheetRow[]): number[] {
  const groupStart = rows.map((_, index) => index);

  for (let i = 1; i < rows.length; i++) {
    const key = rows[i].customerName.trim().toLowerCase();
    if (key && rows[i - 1].customerName.trim().toLowerCase() === key) {
      groupStart[i] = groupStart[i - 1];
    }
  }

  return groupStart;
}

function buildNameCellSpans(groupStartIndices: number[]): number[] {
  const groupSizes = new Array(groupStartIndices.length).fill(0);
  groupStartIndices.forEach((start) => {
    groupSizes[start] += 1;
  });

  return groupStartIndices.map((start, index) => (start === index ? groupSizes[start] : 0));
}

function buildCombinedTotals(rows: SheetRow[], groupStartIndices: number[]): number[] {
  const totals = rows.map((row) => row.days.reduce((sum, value) => sum + value, 0));
  const groupSums = new Array(rows.length).fill(0);
  groupStartIndices.forEach((start, index) => {
    groupSums[start] += totals[index];
  });

  return groupStartIndices.map((start, index) => (start === index ? groupSums[start] : 0));
}

// Lets a user type an expression like "2+3+5" into a day cell and have it
// resolve to the summed total instead of needing a calculator.
function evaluateDayInput(rawValue: string): number {
  const parts = rawValue.split("+");
  const sum = parts.reduce((total, part) => {
    const parsed = Number(part.trim());
    return total + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);

  return sum >= 0 ? sum : 0;
}

function createEmptyRow(serialNumber: number, dayCount: number): SheetRow {
  return {
    serialNumber,
    customerName: "",
    shift: "",
    days: Array.from({ length: dayCount }, () => 0)
  };
}

function createInitialState(): SheetState {
  return createInitialSheet();
}

function normalizeRows(rows: SheetRow[], dayCount: number): SheetRow[] {
  return rows.map((row, index) => ({
    serialNumber: index + 1,
    customerName: row.customerName ?? "",
    shift: row.shift ?? "",
    days: Array.from({ length: dayCount }, (_, dayIndex) => row.days?.[dayIndex] ?? 0)
  }));
}

const ACTIVE_HISTORY_STORAGE_PREFIX = "dairy-farm-active-history:";

type PendingAutoSave = {
  state: SheetState;
  historyId: string | null;
};

type ColumnWidths = {
  serial: number;
  customerName: number;
  shift: number;
  days: number[];
  total: number;
};

type SheetLayoutState = {
  columnWidths: ColumnWidths;
  rowHeights: number[];
};

type DragKind = "row" | "day-column";
type ActiveDrag = { kind: DragKind; sourceIndex: number };

type SheetClipboardPayload =
  | {
      kind: "rows";
      dayCount: number;
      rows: SheetRow[];
      rowHeights: number[];
    }
  | {
      kind: "columns";
      dayCount: number;
      columns: number[][];
      columnWidths: number[];
    };

const SHEET_CLIPBOARD_PREFIX = "DAIRY_FARM_SHEET_CLIPBOARD_V1\n";

const LAYOUT_STORAGE_PREFIX = "dairy-farm-sheet-layout:";
const DEFAULT_SERIAL_WIDTH = 80;
const DEFAULT_CUSTOMER_WIDTH = 144;
const DEFAULT_SHIFT_WIDTH = 80;
const DEFAULT_DAY_WIDTH = 96;
const DEFAULT_TOTAL_WIDTH = 80;
const MIN_COLUMN_WIDTH = 56;
const MAX_COLUMN_WIDTH = 420;
const DEFAULT_ROW_HEIGHT = 56;
const MIN_ROW_HEIGHT = 36;
const MAX_ROW_HEIGHT = 180;

function getLayoutStorageKey(email: string, historyId: string | null): string {
  return `${LAYOUT_STORAGE_PREFIX}${email.trim().toLowerCase()}:${historyId ?? "current"}`;
}

function createDefaultColumnWidths(dayCount: number): ColumnWidths {
  return {
    serial: DEFAULT_SERIAL_WIDTH,
    customerName: DEFAULT_CUSTOMER_WIDTH,
    shift: DEFAULT_SHIFT_WIDTH,
    days: Array.from({ length: dayCount }, () => DEFAULT_DAY_WIDTH),
    total: DEFAULT_TOTAL_WIDTH
  };
}

function normalizeColumnWidths(widths: Partial<ColumnWidths> | undefined, dayCount: number): ColumnWidths {
  const defaults = createDefaultColumnWidths(dayCount);
  const clamp = (value: number, fallback: number) =>
    Number.isFinite(value) ? Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, value)) : fallback;

  return {
    serial: clamp(widths?.serial ?? defaults.serial, defaults.serial),
    customerName: clamp(widths?.customerName ?? defaults.customerName, defaults.customerName),
    shift: clamp(widths?.shift ?? defaults.shift, defaults.shift),
    days: Array.from({ length: dayCount }, (_, index) =>
      clamp(widths?.days?.[index] ?? defaults.days[index], defaults.days[index])
    ),
    total: clamp(widths?.total ?? defaults.total, defaults.total)
  };
}

function normalizeRowHeights(heights: number[] | undefined, rowCount: number): number[] {
  return Array.from({ length: rowCount }, (_, index) => {
    const value = heights?.[index];
    return Number.isFinite(value)
      ? Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, value as number))
      : DEFAULT_ROW_HEIGHT;
  });
}

function getActiveHistoryStorageKey(email: string): string {
  return `${ACTIVE_HISTORY_STORAGE_PREFIX}${email.trim().toLowerCase()}`;
}

function cloneSheetState(state: SheetState): SheetState {
  return {
    dayCount: state.dayCount,
    rows: state.rows.map((row) => ({
      ...row,
      days: [...row.days]
    }))
  };
}

function normalizeSheetState(state: SheetState): SheetState {
  return {
    dayCount: state.dayCount,
    rows: state.rows.map((row, index) => ({
      ...row,
      serialNumber: index + 1,
      days: Array.from(
        { length: state.dayCount },
        (_, dayIndex) => row.days?.[dayIndex] ?? 0
      )
    }))
  };
}

function getSheetCustomerKey(row: Pick<SheetRow, "customerName" | "shift">): string {
  return `${row.customerName.trim().toLowerCase()}|${row.shift.trim().toUpperCase()}`;
}

function getSheetCustomerProjection(rows: SheetRow[]): string[] {
  return rows
    .filter((row) => row.customerName.trim() !== "")
    .map(getSheetCustomerKey);
}

function customerProjectionChanged(previousRows: SheetRow[], nextRows: SheetRow[]): boolean {
  const previousProjection = getSheetCustomerProjection(previousRows);
  const nextProjection = getSheetCustomerProjection(nextRows);

  if (previousProjection.length !== nextProjection.length) {
    return true;
  }

  return previousProjection.some((key, index) => key !== nextProjection[index]);
}

async function syncCustomersFromSheet(
  previousRows: SheetRow[],
  nextRows: SheetRow[]
): Promise<void> {
  const activeUser = getActiveUser();
  if (!activeUser?.email) {
    return;
  }

  if (!customerProjectionChanged(previousRows, nextRows)) {
    return;
  }

  try {
    const existingCustomers = await getCustomers();
    const usedCustomerIndices = new Set<number>();
    const nextCustomers: Customer[] = [];

    const previousKeyAtIndex = (index: number) => {
      const row = previousRows[index];
      return row?.customerName.trim() ? getSheetCustomerKey(row) : "";
    };

    const nextKeyAtIndex = (index: number) => {
      const row = nextRows[index];
      return row?.customerName.trim() ? getSheetCustomerKey(row) : "";
    };

    const previousKeys = previousRows.map((_, index) => previousKeyAtIndex(index));
    const nextKeys = nextRows.map((_, index) => nextKeyAtIndex(index));

    const findUnusedCustomerIndex = (key: string): number => {
      if (!key) {
        return -1;
      }

      return existingCustomers.findIndex(
        (customer, index) =>
          !usedCustomerIndices.has(index) &&
          `${customer.name.trim().toLowerCase()}|${customer.shift.trim().toUpperCase()}` === key
      );
    };

    const findUnusedCustomerByPreviousRow = (rowIndex: number): number => {
      const previousKey = previousKeys[rowIndex];
      if (!previousKey) {
        return -1;
      }
      return findUnusedCustomerIndex(previousKey);
    };

    for (let rowIndex = 0; rowIndex < nextRows.length; rowIndex += 1) {
      const nextRow = nextRows[rowIndex];
      const nextName = nextRow.customerName.trim();

      if (!nextName) {
        continue;
      }

      const previousRow = previousRows[rowIndex];
      const previousKey = previousKeys[rowIndex];
      const nextKey = nextKeys[rowIndex];

      let customerIndex = -1;

      // Prefer the previous row's customer when a name/shift was edited in place.
      // For a true row reorder, both identities also occur elsewhere in the other
      // snapshot, so we use the current exact key instead.
      const previousIdentityMovedElsewhere =
        Boolean(previousKey) &&
        nextKeys.some((key, index) => index !== rowIndex && key === previousKey);

      const currentIdentityCameFromElsewhere =
        Boolean(nextKey) &&
        previousKeys.some((key, index) => index !== rowIndex && key === nextKey);

      const isLikelyReorder =
        previousKey &&
        nextKey &&
        previousKey !== nextKey &&
        previousIdentityMovedElsewhere &&
        currentIdentityCameFromElsewhere;

      if (!isLikelyReorder && previousRow?.customerName.trim()) {
        customerIndex = findUnusedCustomerByPreviousRow(rowIndex);
      }

      if (customerIndex === -1) {
        customerIndex = findUnusedCustomerIndex(nextKey);
      }

      // If the row is new, preserve no fabricated mobile/address data; the
      // Customers page can fill those fields later through its normal editor.
      const sourceCustomer =
        customerIndex >= 0 ? existingCustomers[customerIndex] : undefined;

      if (customerIndex >= 0) {
        usedCustomerIndices.add(customerIndex);
      }

      nextCustomers.push({
        serialNumber: nextCustomers.length + 1,
        name: nextName,
        mobile: sourceCustomer?.mobile ?? "",
        address: sourceCustomer?.address ?? "",
        shift: nextRow.shift ?? "",
        createdAt: sourceCustomer?.createdAt ?? new Date().toISOString()
      });
    }

    // The sheet is the source of truth for the customer/shift rows. Any existing
    // master record that no longer has a corresponding named sheet row is removed.
    await saveCustomersByEmail(activeUser.email, nextCustomers);
    notifyCustomersChanged();
  } catch (error) {
    console.error("Failed to sync sheet customers to the Customers page:", error);
  }
}


function CustomerTable() {
  const navigate = useNavigate();
  const [sheetState, setSheetState] = useState<SheetState>(createInitialState());
  const [showSaveNameModal, setShowSaveNameModal] = useState(false);
  const [showChangeSheetModal, setShowChangeSheetModal] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<SheetHistoryEntry[]>([]);
  const historyEntriesRef = useRef<SheetHistoryEntry[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const activeHistoryIdRef = useRef<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [changingSheet, setChangingSheet] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const [sheetNameInput, setSheetNameInput] = useState("");
  const pendingAutoSaveRef = useRef<PendingAutoSave | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const autoSaveInFlightRef = useRef(false);
  // Holds the raw text (e.g. "2+3+5") while a day cell is being typed into, so
  // the "+" characters aren't stripped before the user finishes the expression.
  const [editingDayCell, setEditingDayCell] = useState<{
    serialNumber: number;
    dayIndex: number;
    text: string;
  } | null>(null);
  const [selectedRowIndices, setSelectedRowIndices] = useState<number[]>([]);
  const [selectedDayIndices, setSelectedDayIndices] = useState<number[]>([]);
  const lastSelectedRowIndexRef = useRef<number | null>(null);
  const lastSelectedDayIndexRef = useRef<number | null>(null);
  const lastSelectionKindRef = useRef<"row" | "column" | null>(null);
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(() => createDefaultColumnWidths(INITIAL_DAYS));
  const [rowHeights, setRowHeights] = useState<number[]>(() =>
    Array.from({ length: createInitialState().rows.length }, () => DEFAULT_ROW_HEIGHT)
  );
  const [layoutReady, setLayoutReady] = useState(false);
  const activeColumnResizeRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const activeRowResizeRef = useRef<{ rowIndex: number; startY: number; startHeight: number } | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const undoStackRef = useRef<SheetState[]>([]);
  const redoStackRef = useRef<SheetState[]>([]);

  const { rows, dayCount } = sheetState;

  useEffect(() => {
    const activeUser = getActiveUser();
    if (!activeUser?.email) {
      setColumnWidths(createDefaultColumnWidths(dayCount));
      setRowHeights(normalizeRowHeights(undefined, rows.length));
      setLayoutReady(true);
      return;
    }

    setLayoutReady(false);
    try {
      const raw = window.localStorage.getItem(getLayoutStorageKey(activeUser.email, activeHistoryIdRef.current));
      if (!raw) {
        setColumnWidths(createDefaultColumnWidths(dayCount));
        setRowHeights(normalizeRowHeights(undefined, rows.length));
      } else {
        const saved = JSON.parse(raw) as Partial<SheetLayoutState>;
        setColumnWidths(normalizeColumnWidths(saved.columnWidths, dayCount));
        setRowHeights(normalizeRowHeights(saved.rowHeights, rows.length));
      }
    } catch (error) {
      console.error("Failed to load sheet layout:", error);
      setColumnWidths(createDefaultColumnWidths(dayCount));
      setRowHeights(normalizeRowHeights(undefined, rows.length));
    } finally {
      setLayoutReady(true);
    }
  }, [activeHistoryId]);

  useEffect(() => {
    if (!layoutReady) {
      return;
    }

    const activeUser = getActiveUser();
    if (!activeUser?.email) {
      return;
    }

    try {
      window.localStorage.setItem(
        getLayoutStorageKey(activeUser.email, activeHistoryIdRef.current),
        JSON.stringify({ columnWidths, rowHeights } satisfies SheetLayoutState)
      );
    } catch (error) {
      console.error("Failed to save sheet layout:", error);
    }
  }, [activeHistoryId, columnWidths, rowHeights, layoutReady]);

  useEffect(() => {
    if (!layoutReady) {
      return;
    }
    setColumnWidths((current) => normalizeColumnWidths(current, dayCount));
    setRowHeights((current) => normalizeRowHeights(current, rows.length));
  }, [dayCount, rows.length, layoutReady]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      const activeUser = getActiveUser();
      if (!activeUser?.email || !event.key || event.key !== getLayoutStorageKey(activeUser.email, activeHistoryIdRef.current)) {
        return;
      }

      if (activeColumnResizeRef.current || activeRowResizeRef.current || !event.newValue) {
        return;
      }

      try {
        const saved = JSON.parse(event.newValue) as Partial<SheetLayoutState>;
        setColumnWidths(normalizeColumnWidths(saved.columnWidths, dayCount));
        setRowHeights(normalizeRowHeights(saved.rowHeights, rows.length));
      } catch {
        // Ignore malformed layout snapshots from another tab.
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [dayCount, rows.length, activeHistoryId]);

  const flushPendingAutoSave = async () => {
    if (autoSaveInFlightRef.current) {
      return;
    }

    const pending = pendingAutoSaveRef.current;
    if (!pending) {
      setSaveStatus("saved");
      return;
    }

    pendingAutoSaveRef.current = null;

    const activeUser = getActiveUser();
    if (!activeUser?.email) {
      setSaveStatus("saved");
      return;
    }

    autoSaveInFlightRef.current = true;
    setSaveStatus("saving");

    try {
      if (pending.historyId) {
        // When an archived/history sheet is open, auto-save the complete edited
        // sheet back into that exact history entry. This keeps the archived copy
        // and the editable history sheet synchronized without touching the live
        // current sheet.
        const nextHistory = historyEntriesRef.current.map((entry) =>
          entry.id === pending.historyId
            ? {
                ...entry,
                ...pending.state,
                savedAt: new Date().toISOString()
              }
            : entry
        );

        historyEntriesRef.current = nextHistory;
        setHistoryEntries(nextHistory);
        await saveHistoryByEmail(activeUser.email, nextHistory);
      } else {
        // For the live/current sheet, auto-save the complete normalized state.
        await saveSheetByEmail(activeUser.email, pending.state);
      }

      setSaveStatus("saved");
    } catch (error) {
      console.error("Automatic sheet save failed:", error);
      setSaveStatus("saving");

      // Keep the latest state queued so a temporary Firebase/network failure is
      // retried automatically instead of silently losing the user's changes.
      if (!pendingAutoSaveRef.current) {
        pendingAutoSaveRef.current = pending;
      }
    } finally {
      autoSaveInFlightRef.current = false;

      if (pendingAutoSaveRef.current && autoSaveTimerRef.current === null) {
        autoSaveTimerRef.current = window.setTimeout(() => {
          autoSaveTimerRef.current = null;
          void flushPendingAutoSave();
        }, 500);
      }
    }
  };

  const queueAutoSave = (state: SheetState, historyId: string | null = activeHistoryIdRef.current) => {
    pendingAutoSaveRef.current = {
      state: normalizeSheetState(state),
      historyId
    };
    setSaveStatus("saving");

    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void flushPendingAutoSave();
    }, 500);
  };

  // Flush any pending save when this component is leaving the page or when the
  // browser hides the tab. The normal debounced save remains the primary path,
  // while this reduces the chance of losing the last edit during navigation.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void flushPendingAutoSave();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      void flushPendingAutoSave();
    };
  }, []);

  // Sync customer names from master customer data. Rows always mirror the customer list
  // 1:1: adding a customer automatically adds a matching row, and removing a customer
  // automatically drops its row, so there are never extra unused rows sitting in the sheet.
  const syncCustomersToSheet = () => {
    if (activeHistoryIdRef.current) {
      return;
    }

    void (async () => {
      const customers = await getCustomers();

      setSheetState((prev) => {
        const { dayCount: prevDayCount, rows: prevRows } = prev;

        if (customers.length === 0) {
          // Guard against a previously-corrupted or shrunken sheet: never leave
          // the table with fewer than the default row count just because there
          // are no customers yet (this also self-heals sheets that were saved
          // with too few rows by an earlier version of this logic).
          const defaultRowCount = createInitialSheet().rows.length;
          const isBlank = prevRows.every(
            (row) =>
              row.customerName.trim() === "" &&
              row.shift.trim() === "" &&
              row.days.every((value) => !value)
          );

          if (prevRows.length >= defaultRowCount || !isBlank) {
            return prev;
          }

          const fallbackRows = normalizeRows(createInitialSheet().rows, prevDayCount);
          const fallbackState = { dayCount: prevDayCount, rows: fallbackRows };
          queueAutoSave(fallbackState, null);
          setRowHeights((current) => normalizeRowHeights(current, fallbackRows.length));
          return fallbackState;
        }

        // Order rows the same way the Customers page does: both-shift customers
        // first, then Morning-only, then Evening-only.
        const orderedCustomers = getOrderedCustomers(customers);

        // Match existing day data by name+shift (not array position) so that
        // reordering a customer into a new priority group doesn't scramble data.
        const existingRowByKey = new Map<string, SheetRow>();
        prevRows.forEach((row) => {
          const key = `${row.customerName.trim().toLowerCase()}|${row.shift}`;
          existingRowByKey.set(key, row);
        });

        const namedRows = orderedCustomers.map((customer, index) => {
          const key = `${(customer.name || "").trim().toLowerCase()}|${customer.shift || ""}`;
          const existingRow = existingRowByKey.get(key);
          return {
            serialNumber: index + 1,
            customerName: customer.name || "",
            shift: customer.shift || existingRow?.shift || "",
            days: Array.from({ length: prevDayCount }, (_, dayIndex) => existingRow?.days?.[dayIndex] ?? 0)
          };
        });

        // Never shrink the sheet's row count when syncing customers in. If the
        // user manually sized the sheet to, say, 50 rows, adding a customer
        // should not collapse it down to just the number of named customers —
        // pad the remainder with empty rows so the manually-set row count sticks.
        const targetRowCount = Math.max(namedRows.length, prevRows.length, 1);
        const nextRows = [...namedRows];
        for (let i = namedRows.length; i < targetRowCount; i++) {
          nextRows.push(createEmptyRow(i + 1, prevDayCount));
        }

        const changed =
          nextRows.length !== prevRows.length ||
          nextRows.some(
            (r, i) => r.customerName !== prevRows[i]?.customerName || r.shift !== prevRows[i]?.shift
          );

        if (changed) {
          const nextState = { dayCount: prevDayCount, rows: nextRows };
          queueAutoSave(nextState, null);
          setRowHeights((current) => normalizeRowHeights(current, nextRows.length));
          notifyMilkDataChanged();
          return nextState;
        }

        return prev;
      });
    })();
  };

  useEffect(() => {
    let isMounted = true;
    let unsubscribeCustomers: (() => void) | undefined;
    let unsubscribeSheet: (() => void) | undefined;
    let unsubscribeHistory: (() => void) | undefined;

    const init = async () => {
      const activeUser = getActiveUser();
      if (!activeUser?.email) {
        if (isMounted) setSheetState(createInitialState());
        return;
      }

      const storageKey = getActiveHistoryStorageKey(activeUser.email);
      const queryEditId = new URLSearchParams(window.location.search).get("edit");
      const storedEditId = window.sessionStorage.getItem(storageKey);
      const editId = queryEditId || storedEditId;
      let initialSheet: SheetState | null = null;

      // When an archived sheet is open, load ONLY that archived entry. Do not load
      // the live/current sheet on refresh, because the archived sheet is the one
      // the user explicitly asked to reopen.
      if (editId) {
        const history = await getHistoryByEmail(activeUser.email);
        const historyEntry = history.find((entry) => entry.id === editId);
        if (historyEntry) {
          initialSheet = {
            dayCount: historyEntry.dayCount,
            rows: normalizeRows(historyEntry.rows, historyEntry.dayCount)
          };
          activeHistoryIdRef.current = historyEntry.id;
          setActiveHistoryId(historyEntry.id);
          window.sessionStorage.setItem(storageKey, historyEntry.id);
          historyEntriesRef.current = history;
          setHistoryEntries(history);
        } else {
          // The URL can become stale if an archived sheet was deleted elsewhere.
          // Fall back to the live sheet and clear the stale edit target.
          const currentSheet = await getSheetByEmail(activeUser.email);
          initialSheet = {
            dayCount: currentSheet.dayCount,
            rows: normalizeRows(currentSheet.rows, currentSheet.dayCount)
          };
          window.sessionStorage.removeItem(storageKey);
          navigate("/customer-details", { replace: true });
        }
      } else {
        window.sessionStorage.removeItem(storageKey);
        const currentSheet = await getSheetByEmail(activeUser.email);
        initialSheet = {
          dayCount: currentSheet.dayCount,
          rows: normalizeRows(currentSheet.rows, currentSheet.dayCount)
        };
      }

      if (!isMounted || !initialSheet) return;
      setSheetState(initialSheet);

      // Keep the history document live in every open tab. This makes archived/history
      // sheets update immediately in a second tab when another tab saves a change.
      unsubscribeHistory = subscribeHistoryByEmail(activeUser.email, (entries) => {
        if (!isMounted) {
          return;
        }

        historyEntriesRef.current = entries;
        setHistoryEntries(entries);

        const openedHistoryId = activeHistoryIdRef.current;
        if (!openedHistoryId) {
          return;
        }

        const remoteEntry = entries.find((entry) => entry.id === openedHistoryId);
        if (!remoteEntry) {
          return;
        }

        // Do not replace unsaved local edits with an incoming snapshot. Once the
        // local edit is persisted, the next remote snapshot is applied normally.
        if (pendingAutoSaveRef.current || autoSaveInFlightRef.current) {
          return;
        }

        setSheetState({
          dayCount: remoteEntry.dayCount,
          rows: normalizeRows(remoteEntry.rows, remoteEntry.dayCount)
        });
        setSaveStatus("saved");
        notifyMilkDataChanged();
      });

      // Only the live sheet needs customer/sheet synchronization. An archived sheet
      // remains isolated from the current live sheet while it is open.
      if (!activeHistoryIdRef.current) {
        syncCustomersToSheet();
        unsubscribeCustomers = subscribeCustomersChanged(syncCustomersToSheet);

        unsubscribeSheet = subscribeSheetByEmail(activeUser.email, (nextSheet) => {
          if (activeHistoryIdRef.current) {
            return;
          }

          // A remote update is safe to apply as long as this tab has no unsaved
          // local edit waiting to be persisted.
          if (pendingAutoSaveRef.current || autoSaveInFlightRef.current) {
            return;
          }

          setSheetState({
            dayCount: nextSheet.dayCount,
            rows: normalizeRows(nextSheet.rows, nextSheet.dayCount)
          });
          setSaveStatus("saved");
          notifyMilkDataChanged();
        });
      }
    };

    void init();

    return () => {
      isMounted = false;
      unsubscribeCustomers?.();
      unsubscribeSheet?.();
      unsubscribeHistory?.();
    };
  }, []);

  const saveState = (nextState: SheetState) => {
    const normalizedState = normalizeSheetState(nextState);
    const currentState = cloneSheetState(sheetState);

    undoStackRef.current.push(currentState);
    redoStackRef.current = [];

    setSheetState(normalizedState);
    queueAutoSave(normalizedState, activeHistoryIdRef.current);

    if (!activeHistoryIdRef.current && customerProjectionChanged(currentState.rows, normalizedState.rows)) {
      void syncCustomersFromSheet(currentState.rows, normalizedState.rows);
    }

    notifyMilkDataChanged();
  };

  const undoSheetChange = async () => {
    const previousState = undoStackRef.current.pop();
    if (!previousState) {
      return;
    }

    const currentState = cloneSheetState(sheetState);
    redoStackRef.current.push(currentState);

    const normalizedState = normalizeSheetState(previousState);
    setSheetState(normalizedState);
    queueAutoSave(normalizedState, activeHistoryIdRef.current);

    if (!activeHistoryIdRef.current && customerProjectionChanged(currentState.rows, normalizedState.rows)) {
      void syncCustomersFromSheet(currentState.rows, normalizedState.rows);
    }

    notifyMilkDataChanged();
  };

  const redoSheetChange = async () => {
    const nextState = redoStackRef.current.pop();
    if (!nextState) {
      return;
    }

    const currentState = cloneSheetState(sheetState);
    undoStackRef.current.push(currentState);

    const normalizedState = normalizeSheetState(nextState);
    setSheetState(normalizedState);
    queueAutoSave(normalizedState, activeHistoryIdRef.current);

    if (!activeHistoryIdRef.current && customerProjectionChanged(currentState.rows, normalizedState.rows)) {
      void syncCustomersFromSheet(currentState.rows, normalizedState.rows);
    }

    notifyMilkDataChanged();
  };

  const archiveToHistory = async (name: string) => {
    const activeUser = getActiveUser();
    if (!activeUser?.email) {
      return;
    }

    // Make sure the newest edit is persisted before creating an archived copy.
    await flushPendingAutoSave();

    const normalizedCurrent = normalizeSheetState(sheetState);
    const nextSheet = await archiveSheetByEmail(activeUser.email, normalizedCurrent, name);
    activeHistoryIdRef.current = null;
    setActiveHistoryId(null);
    const activeUserEmail = activeUser.email;
    window.sessionStorage.removeItem(getActiveHistoryStorageKey(activeUserEmail));
    setSheetState(nextSheet);
    notifyMilkDataChanged();
    navigate("/customer-details", { replace: true });
  };

  const openSaveNameModal = () => {
    setSheetNameInput("");
    setShowSaveNameModal(true);
  };

  const confirmSaveToHistory = async () => {
    const activeUser = getActiveUser();
    if (!activeUser?.email) {
      return;
    }

    await flushPendingAutoSave();
    const normalizedCurrent = normalizeSheetState(sheetState);

    if (!activeHistoryId) {
      const savedEntry = await saveSheetToHistoryByEmail(activeUser.email, normalizedCurrent, sheetNameInput);
      const nextHistory = [savedEntry, ...historyEntriesRef.current];
      historyEntriesRef.current = nextHistory;
      setHistoryEntries(nextHistory);
      setShowSaveNameModal(false);
      return;
    }

    const normalizedState = normalizedCurrent;

    const nextHistory = historyEntriesRef.current.map((entry) =>
      entry.id === activeHistoryId
        ? {
            ...entry,
            ...normalizedState,
            savedAt: new Date().toISOString(),
            archived: false,
            ...(sheetNameInput.trim() ? { name: sheetNameInput.trim() } : {})
          }
        : entry
    );

    historyEntriesRef.current = nextHistory;
    await saveHistoryByEmail(activeUser.email, nextHistory);
    const currentSheet = await getSheetByEmail(activeUser.email, true);
    setActiveHistoryId(null);
    activeHistoryIdRef.current = null;
    window.sessionStorage.removeItem(getActiveHistoryStorageKey(activeUser.email));
    setSheetState(currentSheet);
    setHistoryEntries(nextHistory.filter((entry) => entry.archived !== false));
    setShowSaveNameModal(false);
    navigate("/customer-details", { replace: true });
  };

  const openChangeSheetModal = () => {
    setShowChangeSheetModal(true);
    setHistoryLoading(true);
    const activeUser = getActiveUser();
    if (!activeUser?.email) {
      setHistoryEntries([]);
      setHistoryLoading(false);
      return;
    }

    void getHistoryByEmail(activeUser.email)
      .then((entries) => {
        historyEntriesRef.current = entries;
        setHistoryEntries(entries);
      })
      .catch(() => {
        historyEntriesRef.current = [];
        setHistoryEntries([]);
      })
      .finally(() => setHistoryLoading(false));
  };

  const archivedEntries = historyEntries.filter((entry) => entry.archived !== false);

  const changeSheet = async (entry: SheetHistoryEntry) => {
    const activeUser = getActiveUser();
    if (!activeUser?.email || changingSheet) {
      return;
    }

    setChangingSheet(true);
    try {
      const nextSheet = {
        dayCount: entry.dayCount,
        rows: entry.rows
      };
      activeHistoryIdRef.current = entry.id;
      setActiveHistoryId(entry.id);
      window.sessionStorage.setItem(getActiveHistoryStorageKey(activeUser.email), entry.id);
      setSheetState(nextSheet);
      notifyMilkDataChanged();
      setShowChangeSheetModal(false);

      // Persist the currently opened archived sheet in the URL so a browser
      // refresh reopens this exact archived sheet instead of the live sheet.
      navigate(`/customer-details?edit=${encodeURIComponent(entry.id)}`, { replace: true });
    } finally {
      setChangingSheet(false);
    }
  };

  const deleteArchivedSheet = async (entry: SheetHistoryEntry) => {
    const activeUser = getActiveUser();
    if (!activeUser?.email || changingSheet) {
      return;
    }

    const sheetLabel = entry.name || "this sheet";
    if (!window.confirm(`Delete ${sheetLabel}? This cannot be undone.`)) {
      return;
    }

    if (activeHistoryId === entry.id) {
      await flushPendingAutoSave();
    }

    const nextHistory = historyEntriesRef.current.filter((item) => item.id !== entry.id);
    historyEntriesRef.current = nextHistory;
    setHistoryEntries(nextHistory);
    if (activeHistoryId === entry.id) {
      activeHistoryIdRef.current = null;
      setActiveHistoryId(null);
      window.sessionStorage.removeItem(getActiveHistoryStorageKey(activeUser.email));
      const currentSheet = await getSheetByEmail(activeUser.email, true);
      setSheetState({
        dayCount: currentSheet.dayCount,
        rows: normalizeRows(currentSheet.rows, currentSheet.dayCount)
      });
      navigate("/customer-details", { replace: true });
    }
    await saveHistoryByEmail(activeUser.email, nextHistory);
  };

  const updateCustomerName = (serialNumber: number, customerName: string) => {
    const targetRow = rows.find((row) => row.serialNumber === serialNumber);
    if (!targetRow) {
      return;
    }

    const oldKey = targetRow.customerName.trim().toLowerCase();

    const nextRows = rows.map((row) => {
      if (row.serialNumber === serialNumber) {
        return { ...row, customerName };
      }
      if (oldKey && row.customerName.trim().toLowerCase() === oldKey) {
        return { ...row, customerName };
      }
      return row;
    });

    saveState({ dayCount, rows: nextRows });
  };

  const updateShift = (serialNumber: number, shift: string) => {
    const targetRow = rows.find((row) => row.serialNumber === serialNumber);
    if (!targetRow) {
      return;
    }

    const nextRows = rows.map((row) =>
      row.serialNumber === serialNumber ? { ...row, shift } : row
    );

    saveState({ dayCount, rows: nextRows });
  };

  const updateDayValue = (serialNumber: number, dayIndex: number, value: string) => {
    // Supports typing an expression like "2+3+5" and committing the summed total.
    const safeValue = evaluateDayInput(value);

    const nextRows = rows.map((row) => {
      if (row.serialNumber !== serialNumber) {
        return row;
      }

      const nextDays = [...row.days];
      nextDays[dayIndex] = safeValue;

      return { ...row, days: nextDays };
    });

    saveState({ dayCount, rows: nextRows });
  };

  const getGroupBounds = (rowIndex: number) => {
    const groupStarts = buildGroupStartIndices(rows);
    const start = groupStarts[rowIndex] ?? rowIndex;
    let end = start;
    while (end + 1 < rows.length && groupStarts[end + 1] === start) {
      end += 1;
    }
    return { start, end };
  };

  const handleRowDragStart = (rowIndex: number, event: React.DragEvent<HTMLElement>) => {
    const { start } = getGroupBounds(rowIndex);
    setActiveDrag({ kind: "row", sourceIndex: start });
    setDragOverIndex(start);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `row:${start}`);
  };

  const handleRowDragOver = (rowIndex: number, event: React.DragEvent<HTMLElement>) => {
    if (activeDrag?.kind !== "row") return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverIndex(getGroupBounds(rowIndex).start);
  };

  const handleRowDrop = (rowIndex: number, event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (activeDrag?.kind !== "row") return;

    const sourceBounds = getGroupBounds(activeDrag.sourceIndex);
    const targetStart = getGroupBounds(rowIndex).start;

    if (targetStart === sourceBounds.start) {
      setActiveDrag(null);
      setDragOverIndex(null);
      return;
    }

    const movingRows = rows.slice(sourceBounds.start, sourceBounds.end + 1);
    const movingHeights = normalizeRowHeights(rowHeights, rows.length).slice(sourceBounds.start, sourceBounds.end + 1);
    const remainingRows = [
      ...rows.slice(0, sourceBounds.start),
      ...rows.slice(sourceBounds.end + 1)
    ];
    const remainingHeights = [
      ...normalizeRowHeights(rowHeights, rows.length).slice(0, sourceBounds.start),
      ...normalizeRowHeights(rowHeights, rows.length).slice(sourceBounds.end + 1)
    ];

    const adjustedTarget = targetStart > sourceBounds.start
      ? targetStart - movingRows.length
      : targetStart;

    const nextRows = [
      ...remainingRows.slice(0, adjustedTarget),
      ...movingRows,
      ...remainingRows.slice(adjustedTarget)
    ].map((row, index) => ({ ...row, serialNumber: index + 1 }));

    const nextHeights = [
      ...remainingHeights.slice(0, adjustedTarget),
      ...movingHeights,
      ...remainingHeights.slice(adjustedTarget)
    ];

    setSelectedRowIndices([]);
    lastSelectedRowIndexRef.current = null;
    setRowHeights(nextHeights);
    saveState({ dayCount, rows: nextRows });

    setActiveDrag(null);
    setDragOverIndex(null);
  };

  const handleDayColumnDragStart = (dayIndex: number, event: React.DragEvent<HTMLElement>) => {
    setActiveDrag({ kind: "day-column", sourceIndex: dayIndex });
    setDragOverIndex(dayIndex);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `day-column:${dayIndex}`);
  };

  const handleDayColumnDragOver = (dayIndex: number, event: React.DragEvent<HTMLElement>) => {
    if (activeDrag?.kind !== "day-column") return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverIndex(dayIndex);
  };

  const handleDayColumnDrop = (dayIndex: number, event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (activeDrag?.kind !== "day-column") return;

    const sourceIndex = activeDrag.sourceIndex;
    const targetIndex = dayIndex;

    if (sourceIndex === targetIndex) {
      setActiveDrag(null);
      setDragOverIndex(null);
      return;
    }

    const nextRows = rows.map((row) => {
      const nextDays = [...row.days];
      const [moved] = nextDays.splice(sourceIndex, 1);
      nextDays.splice(targetIndex, 0, moved);
      return { ...row, days: nextDays };
    });

    setColumnWidths((current) => {
      const nextDays = [...current.days];
      const [movedWidth] = nextDays.splice(sourceIndex, 1);
      nextDays.splice(targetIndex, 0, movedWidth);
      return { ...current, days: nextDays };
    });
    setSelectedDayIndices([]);
    lastSelectedDayIndexRef.current = null;
    saveState({ dayCount, rows: nextRows });
    setActiveDrag(null);
    setDragOverIndex(null);
  };

  const clearDragState = () => {
    setActiveDrag(null);
    setDragOverIndex(null);
  };

  const startColumnResize = (key: string, startWidth: number, event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    activeColumnResizeRef.current = { key, startX: event.clientX, startWidth };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is not available in every browser.
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const resize = activeColumnResizeRef.current;
      if (!resize) {
        return;
      }

      const nextWidth = Math.min(
        MAX_COLUMN_WIDTH,
        Math.max(MIN_COLUMN_WIDTH, resize.startWidth + (moveEvent.clientX - resize.startX))
      );

      setColumnWidths((current) => {
        if (resize.key === "serial") return { ...current, serial: nextWidth };
        if (resize.key === "customerName") return { ...current, customerName: nextWidth };
        if (resize.key === "shift") return { ...current, shift: nextWidth };
        if (resize.key === "total") return { ...current, total: nextWidth };
        if (resize.key.startsWith("day:")) {
          const dayIndex = Number(resize.key.slice(4));
          const days = [...current.days];
          days[dayIndex] = nextWidth;
          return { ...current, days };
        }
        return current;
      });
    };

    const stopResize = () => {
      activeColumnResizeRef.current = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  };

  const startRowResize = (rowIndex: number, startHeight: number, event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();

    activeRowResizeRef.current = { rowIndex, startY: event.clientY, startHeight };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is not available in every browser. Window listeners still handle dragging.
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const resize = activeRowResizeRef.current;
      if (!resize) {
        return;
      }

      const deltaY = moveEvent.clientY - resize.startY;
      const nextHeight = Math.min(
        MAX_ROW_HEIGHT,
        Math.max(MIN_ROW_HEIGHT, resize.startHeight + deltaY)
      );

      setRowHeights((current) => {
        const next = normalizeRowHeights(current, rows.length);
        if (next[resize.rowIndex] === nextHeight) {
          return current;
        }
        next[resize.rowIndex] = nextHeight;
        return next;
      });
    };

    const stopResize = () => {
      activeRowResizeRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      window.removeEventListener("blur", stopResize);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    window.addEventListener("blur", stopResize);
  };

  const isEditableClipboardTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    const tagName = target.tagName.toLowerCase();
    return tagName === "input" || tagName === "textarea" || target.isContentEditable;
  };

  const writeTextToClipboard = async (text: string) => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (error) {
        console.warn("Clipboard API write failed; trying fallback copy.", error);
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    textarea.setAttribute("aria-hidden", "true");
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const copySelectedRows = async () => {
    if (selectedRowIndices.length === 0) return;

    const selected = new Set(selectedRowIndices);
    const sourceRows = rows
      .filter((_, index) => selected.has(index))
      .map((row) => ({
        ...row,
        days: [...row.days]
      }));
    const heights = normalizeRowHeights(rowHeights, rows.length)
      .filter((_, index) => selected.has(index));

    const payload: SheetClipboardPayload = {
      kind: "rows",
      dayCount,
      rows: sourceRows,
      rowHeights: heights
    };

    await writeTextToClipboard(SHEET_CLIPBOARD_PREFIX + JSON.stringify(payload));
  };

  const copySelectedColumns = async () => {
    if (selectedDayIndices.length === 0) return;

    const sortedIndices = [...selectedDayIndices].sort((a, b) => a - b);
    const payload: SheetClipboardPayload = {
      kind: "columns",
      dayCount: sortedIndices.length,
      columns: sortedIndices.map((dayIndex) => rows.map((row) => row.days[dayIndex] ?? 0)),
      columnWidths: sortedIndices.map((dayIndex) => columnWidths.days[dayIndex] ?? DEFAULT_DAY_WIDTH)
    };

    await writeTextToClipboard(SHEET_CLIPBOARD_PREFIX + JSON.stringify(payload));
  };

  const pasteSheetClipboard = (rawText: string) => {
    if (!rawText.startsWith(SHEET_CLIPBOARD_PREFIX)) {
      return false;
    }

    try {
      const payload = JSON.parse(rawText.slice(SHEET_CLIPBOARD_PREFIX.length)) as SheetClipboardPayload;

      if (payload.kind === "rows" && payload.rows.length > 0 && selectedRowIndices.length > 0) {
        const targetStart = Math.min(...selectedRowIndices);
        const nextDayCount = Math.max(
          dayCount,
          payload.dayCount,
          ...payload.rows.map((sourceRow) => sourceRow.days.length)
        );
        const requiredRowCount = Math.max(rows.length, targetStart + payload.rows.length);
        const nextRows = Array.from({ length: requiredRowCount }, (_, index) => {
          const existing = rows[index];
          return existing
            ? {
                ...existing,
                days: Array.from({ length: nextDayCount }, (_, dayIndex) => existing.days[dayIndex] ?? 0)
              }
            : createEmptyRow(index + 1, nextDayCount);
        });
        const nextHeights = normalizeRowHeights(rowHeights, requiredRowCount);

        payload.rows.forEach((sourceRow, offset) => {
          const targetIndex = targetStart + offset;
          nextRows[targetIndex] = {
            ...sourceRow,
            serialNumber: targetIndex + 1,
            days: Array.from({ length: nextDayCount }, (_, dayIndex) => sourceRow.days[dayIndex] ?? 0)
          };
          nextHeights[targetIndex] = payload.rowHeights[offset] ?? DEFAULT_ROW_HEIGHT;
        });

        saveState({ dayCount: nextDayCount, rows: nextRows });
        setRowHeights(nextHeights);
        setSelectedRowIndices([]);
        lastSelectedRowIndexRef.current = null;
        lastSelectionKindRef.current = "row";
        return true;
      }

      if (payload.kind === "columns" && payload.columns.length > 0 && selectedDayIndices.length > 0) {
        const targetStart = Math.min(...selectedDayIndices);
        const nextDayCount = Math.max(dayCount, targetStart + payload.columns.length);
        const nextRows = rows.map((row, rowIndex) => {
          const nextDays = Array.from({ length: nextDayCount }, (_, dayIndex) => row.days[dayIndex] ?? 0);

          payload.columns.forEach((columnValues, offset) => {
            const targetDayIndex = targetStart + offset;
            nextDays[targetDayIndex] = columnValues[rowIndex] ?? 0;
          });

          return { ...row, days: nextDays };
        });

        const sourceRowCount = payload.columns[0]?.length ?? rows.length;
        for (let rowIndex = nextRows.length; rowIndex < sourceRowCount; rowIndex += 1) {
          const days = Array.from({ length: nextDayCount }, () => 0);
          payload.columns.forEach((columnValues, offset) => {
            days[targetStart + offset] = columnValues[rowIndex] ?? 0;
          });
          nextRows.push({
            ...createEmptyRow(rowIndex + 1, nextDayCount),
            days
          });
        }

        const currentWidths = normalizeColumnWidths(columnWidths, nextDayCount);
        const nextWidths = [...currentWidths.days];
        payload.columnWidths.forEach((width, offset) => {
          const targetDayIndex = targetStart + offset;
          nextWidths[targetDayIndex] = Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width));
        });

        saveState({ dayCount: nextDayCount, rows: nextRows });
        setColumnWidths({ ...currentWidths, days: nextWidths });
        setSelectedDayIndices([]);
        lastSelectedDayIndexRef.current = null;
        lastSelectionKindRef.current = "column";
        return true;
      }
    } catch (error) {
      console.error("Failed to paste Dairy Farm sheet data:", error);
    }

    return false;
  };

  useEffect(() => {
    const handleSheetShortcuts = async (event: KeyboardEvent) => {
      if (isEditableClipboardTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;

      // Ctrl/Cmd + Z: undo the latest sheet change.
      // Ctrl/Cmd + Shift + Z and Ctrl/Cmd + Y: redo the latest undone change.
      if (modifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          await redoSheetChange();
        } else {
          await undoSheetChange();
        }
        return;
      }

      if (modifier && key === "y") {
        event.preventDefault();
        await redoSheetChange();
        return;
      }

      // Ctrl/Cmd + C: copy the currently selected row(s) or Day column(s).
      if (modifier && key === "c") {
        if (lastSelectionKindRef.current === "column" && selectedDayIndices.length > 0) {
          event.preventDefault();
          await copySelectedColumns();
        } else if (lastSelectionKindRef.current === "row" && selectedRowIndices.length > 0) {
          event.preventDefault();
          await copySelectedRows();
        }
        return;
      }

      // Ctrl/Cmd + V: paste sheet data into the current selection.
      if (modifier && key === "v") {
        try {
          const clipboardText = await navigator.clipboard.readText();
          if (pasteSheetClipboard(clipboardText)) {
            event.preventDefault();
          }
        } catch {
          // The native paste event below still handles browsers that deny clipboard-read permission.
        }
        return;
      }

      // Ctrl/Cmd + S: force the pending sheet changes to save immediately.
      if (modifier && key === "s") {
        event.preventDefault();
        await flushPendingAutoSave();
        return;
      }

      // Delete / Backspace: remove the currently selected rows or Day columns.
      // This is intentionally disabled while an input is focused.
      if (!modifier && (key === "delete" || key === "backspace")) {
        if (lastSelectionKindRef.current === "column" && selectedDayIndices.length > 0) {
          event.preventDefault();
          removeSelectedColumns();
        } else if (lastSelectionKindRef.current === "row" && selectedRowIndices.length > 0) {
          event.preventDefault();
          removeSelectedRows();
        }
        return;
      }

      // Escape: clear the current sheet selection.
      if (key === "escape") {
        setSelectedRowIndices([]);
        setSelectedDayIndices([]);
        lastSelectedRowIndexRef.current = null;
        lastSelectedDayIndexRef.current = null;
        lastSelectionKindRef.current = null;
      }
    };

    const handlePaste = (event: ClipboardEvent) => {
      if (isEditableClipboardTarget(event.target)) {
        return;
      }

      const clipboardText = event.clipboardData?.getData("text/plain") ?? "";
      if (pasteSheetClipboard(clipboardText)) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleSheetShortcuts);
    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("keydown", handleSheetShortcuts);
      window.removeEventListener("paste", handlePaste);
    };
  }, [
    columnWidths,
    dayCount,
    rowHeights,
    rows,
    selectedDayIndices,
    selectedRowIndices
  ]);

  // Select exactly one shift row on double-click. A single click on the
  // Shift input remains available for normal editing, while a double-click
  // selects only that shift for row deletion.
  const selectSingleShiftRow = (rowIndex: number, event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();

    const isToggleSelection = event.ctrlKey || event.metaKey;

    setSelectedRowIndices((current) => {
      if (isToggleSelection) {
        return current.includes(rowIndex)
          ? current.filter((index) => index !== rowIndex)
          : [...current, rowIndex].sort((a, b) => a - b);
      }

      return current.length === 1 && current[0] === rowIndex ? [] : [rowIndex];
    });

    lastSelectedRowIndexRef.current = rowIndex;
    lastSelectionKindRef.current = "row";
  };

  const selectRow = (rowIndex: number, event: MouseEvent<HTMLElement>) => {
    const groupStarts = buildGroupStartIndices(rows);
    const groupStart = groupStarts[rowIndex] ?? rowIndex;
    const groupEnd = (() => {
      for (let index = groupStart + 1; index < groupStarts.length; index += 1) {
        if (groupStarts[index] !== groupStart) {
          return index - 1;
        }
      }
      return rows.length - 1;
    })();
    const getGroupRows = (start: number, end: number) =>
      Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);

    const isRangeSelection = event.shiftKey && lastSelectedRowIndexRef.current !== null;
    const isToggleSelection = event.ctrlKey || event.metaKey;

    setSelectedRowIndices((current) => {
      if (isRangeSelection) {
        const lastStart = lastSelectedRowIndexRef.current as number;
        const rangeStart = Math.min(lastStart, groupStart);
        const rangeEnd = Math.max(
          (() => {
            for (let index = lastStart + 1; index < groupStarts.length; index += 1) {
              if (groupStarts[index] !== lastStart) {
                return index - 1;
              }
            }
            return rows.length - 1;
          })(),
          groupEnd
        );
        const range = getGroupRows(rangeStart, rangeEnd);
        return isToggleSelection ? Array.from(new Set([...current, ...range])).sort((a, b) => a - b) : range;
      }

      const groupRows = getGroupRows(groupStart, groupEnd);
      if (isToggleSelection) {
        const allSelected = groupRows.every((index) => current.includes(index));
        return allSelected
          ? current.filter((index) => !groupRows.includes(index))
          : Array.from(new Set([...current, ...groupRows])).sort((a, b) => a - b);
      }

      // Clicking the already-selected row edge again clears that selection.
      const onlyThisGroupIsSelected =
        current.length === groupRows.length && groupRows.every((index) => current.includes(index));
      return onlyThisGroupIsSelected ? [] : groupRows;
    });

    lastSelectedRowIndexRef.current = groupStart;
    lastSelectionKindRef.current = "row";
  };

  const selectDayColumn = (dayIndex: number, event: MouseEvent<HTMLElement>) => {
    const isRangeSelection = event.shiftKey && lastSelectedDayIndexRef.current !== null;
    const isToggleSelection = event.ctrlKey || event.metaKey;

    setSelectedDayIndices((current) => {
      if (isRangeSelection) {
        const start = Math.min(lastSelectedDayIndexRef.current as number, dayIndex);
        const end = Math.max(lastSelectedDayIndexRef.current as number, dayIndex);
        const range = Array.from({ length: end - start + 1 }, (_, index) => start + index);
        return isToggleSelection ? Array.from(new Set([...current, ...range])).sort((a, b) => a - b) : range;
      }

      if (isToggleSelection) {
        return current.includes(dayIndex)
          ? current.filter((index) => index !== dayIndex)
          : [...current, dayIndex].sort((a, b) => a - b);
      }

      // Clicking the already-selected column edge again clears that selection.
      return current.length === 1 && current[0] === dayIndex ? [] : [dayIndex];
    });

    lastSelectedDayIndexRef.current = dayIndex;
    lastSelectionKindRef.current = "column";
  };

  const removeSelectedRows = () => {
    if (selectedRowIndices.length === 0 || rows.length - selectedRowIndices.length < 1) {
      return;
    }

    const selected = new Set(selectedRowIndices);
    const nextRows = rows
      .filter((_, index) => !selected.has(index))
      .map((row, index) => ({
        ...row,
        serialNumber: index + 1
      }));

    saveState({ dayCount, rows: nextRows });
    setRowHeights((current) => current.filter((_, index) => !selected.has(index)));
    setSelectedRowIndices([]);
    lastSelectedRowIndexRef.current = null;
  };

  const removeSelectedColumns = () => {
    if (selectedDayIndices.length === 0 || dayCount - selectedDayIndices.length < 1) {
      return;
    }

    const selected = new Set(selectedDayIndices);
    const nextRows = rows.map((row) => ({
      ...row,
      days: row.days.filter((_, index) => !selected.has(index))
    }));

    saveState({ dayCount: dayCount - selectedDayIndices.length, rows: nextRows });
    setSelectedDayIndices([]);
    lastSelectedDayIndexRef.current = null;
  };

  const addRow = () => {
    const nextRows = [...rows, createEmptyRow(rows.length + 1, dayCount)];
    saveState({ dayCount, rows: nextRows });
  };

  const removeRow = () => {
    if (rows.length <= 1) {
      return;
    }

    const nextRows = rows.slice(0, -1).map((row, index) => ({
      ...row,
      serialNumber: index + 1
    }));

    saveState({ dayCount, rows: nextRows });
    setRowHeights((current) => normalizeRowHeights(current, Math.max(1, rows.length - 1)));
    setSelectedRowIndices([]);
    lastSelectedRowIndexRef.current = null;
  };

  const addColumn = () => {
    const nextRows = rows.map((row) => ({
      ...row,
      days: [...row.days, 0]
    }));

    saveState({ dayCount: dayCount + 1, rows: nextRows });
    setColumnWidths((current) => ({ ...current, days: [...normalizeColumnWidths(current, dayCount).days, DEFAULT_DAY_WIDTH] }));
  };

  const removeColumn = () => {
    if (dayCount <= 1) {
      return;
    }

    const nextRows = rows.map((row) => ({
      ...row,
      days: row.days.slice(0, -1)
    }));

    saveState({ dayCount: dayCount - 1, rows: nextRows });
    setColumnWidths((current) => ({ ...current, days: current.days.slice(0, -1) }));
    setSelectedDayIndices((current) => current.filter((index) => index < dayCount - 1));
    lastSelectedDayIndexRef.current = null;
  };

  const backToCurrentSheet = async () => {
    const activeUser = getActiveUser();
    if (!activeUser?.email) {
      navigate("/customer-details", { replace: true });
      return;
    }

    await flushPendingAutoSave();
    activeHistoryIdRef.current = null;
    setActiveHistoryId(null);
    window.sessionStorage.removeItem(getActiveHistoryStorageKey(activeUser.email));
    const currentSheet = await getSheetByEmail(activeUser.email, true);
    setSheetState({
      dayCount: currentSheet.dayCount,
      rows: normalizeRows(currentSheet.rows, currentSheet.dayCount)
    });
    setSaveStatus("saved");
    navigate("/customer-details", { replace: true });
  };

  return (
    <div className="space-y-3 bg-white p-2 sm:p-2.5 md:p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:flex lg:items-start lg:justify-between lg:gap-4">
        <div className="col-span-1 grid grid-cols-2 gap-2 sm:col-span-2 sm:grid-cols-2 md:col-span-3 md:contents lg:col-span-auto lg:flex lg:flex-nowrap lg:items-center lg:gap-2">
          <button
            type="button"
            onClick={addRow}
            className="w-full min-h-[40px] rounded-lg bg-brand-500 px-2 py-2 text-[11px] font-semibold text-white hover:bg-brand-700 sm:min-h-[42px] sm:px-2.5 sm:text-xs md:text-sm md:px-2.5 touch-manipulation whitespace-nowrap"
          >
            Add Row
          </button>
          <button
            type="button"
            onClick={removeRow}
            disabled={rows.length <= 1}
            className="w-full min-h-[40px] rounded-lg border border-red-500 bg-red-500 px-2 py-2 text-[11px] font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[42px] sm:px-2.5 sm:text-xs md:text-sm md:px-2.5 touch-manipulation whitespace-nowrap"
          >
            Remove Row
          </button>
          <button
            type="button"
            onClick={removeSelectedRows}
            disabled={selectedRowIndices.length === 0 || rows.length - selectedRowIndices.length < 1}
            className="w-full min-h-[40px] rounded-lg border border-rose-600 bg-rose-600 px-2 py-2 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[42px] sm:px-2.5 sm:text-xs md:text-sm md:px-2.5 touch-manipulation whitespace-nowrap"
          >
            Delete{selectedRowIndices.length ? ` (${selectedRowIndices.length})` : ""}
          </button>
          <button
            type="button"
            onClick={addColumn}
            className="w-full min-h-[40px] rounded-lg bg-brand-500 px-2 py-2 text-[11px] font-semibold text-white hover:bg-brand-700 sm:min-h-[42px] sm:px-2.5 sm:text-xs md:text-sm md:px-2.5 touch-manipulation whitespace-nowrap"
          >
            Add Column
          </button>
          <button
            type="button"
            onClick={removeColumn}
            disabled={dayCount <= 1}
            className="w-full min-h-[40px] rounded-lg border border-red-500 bg-red-500 px-2 py-2 text-[11px] font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[42px] sm:px-2.5 sm:text-xs md:text-sm md:px-2.5 touch-manipulation whitespace-nowrap"
          >
            Remove Column
          </button>
          <button
            type="button"
            onClick={removeSelectedColumns}
            disabled={selectedDayIndices.length === 0 || dayCount - selectedDayIndices.length < 1}
            className="w-full min-h-[40px] rounded-lg border border-rose-600 bg-rose-600 px-2 py-2 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[42px] sm:px-2.5 sm:text-xs md:text-sm md:px-2.5 touch-manipulation whitespace-nowrap"
          >
            Delete{selectedDayIndices.length ? ` (${selectedDayIndices.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => void archiveToHistory("")}
            className="w-full min-h-[40px] rounded-lg border border-amber-500 bg-amber-500 px-2 py-2 text-[11px] font-semibold text-white hover:bg-amber-600 sm:min-h-[42px] sm:px-2.5 sm:text-xs md:text-sm md:px-2.5 touch-manipulation whitespace-nowrap"
          >
            Archive
          </button>
          <button
            type="button"
            onClick={openChangeSheetModal}
            className="w-full min-h-[40px] rounded-lg border border-indigo-500 bg-indigo-500 px-2 py-2 text-[11px] font-semibold text-white hover:bg-indigo-600 sm:min-h-[42px] sm:px-2.5 sm:text-xs md:text-sm md:px-2.5 touch-manipulation whitespace-nowrap"
          >
            Archived Sheets
          </button>
        </div>
        <div
          className={
            activeHistoryId
              ? "col-span-1 grid grid-cols-2 gap-2 sm:col-span-2 md:col-span-3 md:contents lg:col-span-auto lg:flex lg:items-center lg:gap-2"
              : "col-span-1 flex gap-2 sm:col-span-2 md:col-span-3 md:contents lg:col-span-auto lg:flex lg:items-center lg:gap-2"
          }
        >
          {activeHistoryId ? (
            <button
              type="button"
              onClick={() => void backToCurrentSheet()}
              className="w-full min-h-[40px] min-w-0 rounded-lg border border-sky-500 bg-sky-500 px-2 py-2 text-[11px] font-semibold text-white hover:bg-sky-600 sm:min-h-[42px] sm:px-2.5 sm:text-xs md:text-sm md:px-2.5 md:col-start-3 md:row-start-3 lg:col-start-auto lg:row-start-auto lg:w-auto lg:whitespace-nowrap touch-manipulation whitespace-nowrap"
            >
              Back to Current Sheet
            </button>
          ) : null}
          <button
            type="button"
            onClick={openSaveNameModal}
            className={`min-h-[40px] min-w-0 rounded-lg border border-emerald-500 bg-emerald-500 px-2 py-2 text-[11px] font-semibold text-white hover:bg-emerald-600 sm:min-h-[42px] sm:px-2.5 sm:text-xs md:text-sm md:px-2.5 ${activeHistoryId ? "w-full md:col-span-3 md:row-start-4" : "w-full flex-1"} lg:col-start-auto lg:row-start-auto lg:col-span-auto lg:w-auto lg:whitespace-nowrap touch-manipulation whitespace-nowrap`}
          >
            Save to History
          </button>
          <span className="sr-only" aria-live="polite">
            {saveStatus === "saving" ? "Saving..." : "Saved"}
          </span>
        </div>
      </div>

      {showSaveNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-lg">
            <h3 className="text-sm font-semibold text-slate-800">Name this sheet</h3>
            <p className="mt-1 text-xs text-slate-500">Give this saved sheet a name so it's easy to find in History.</p>
            <input
              type="text"
              autoFocus
              value={sheetNameInput}
              onChange={(event) => setSheetNameInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  confirmSaveToHistory();
                }
              }}
              placeholder="e.g. Sheet 1"
              className="mt-3 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSaveNameModal(false)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSaveToHistory}
                className="rounded-lg border border-emerald-300 px-3 py-2 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showChangeSheetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Archived sheets</h3>
                <p className="mt-1 text-xs text-slate-500">Open a saved sheet to edit it.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowChangeSheetModal(false)}
                className="rounded-lg px-2 py-1 text-lg leading-none text-slate-500 hover:bg-slate-100"
                aria-label="Close change sheet dialog"
              >
                ×
              </button>
            </div>
            {historyLoading ? (
              <p className="mt-4 text-sm text-slate-500">Loading saved sheets...</p>
            ) : archivedEntries.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No saved sheets found. Save a sheet to History first.</p>
            ) : (
              <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                {archivedEntries.map((entry, index) => (
                  <div
                    key={entry.id}
                    className="flex min-h-[52px] w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">{entry.name || `Sheet ${archivedEntries.length - index}`}</span>
                      <span className="mt-1 block text-xs text-slate-500">Saved {new Date(entry.savedAt).toLocaleString()}</span>
                    </span>
                    <span className="ml-3 flex shrink-0 items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void changeSheet(entry)}
                        disabled={changingSheet}
                        className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteArchivedSheet(entry)}
                        disabled={changingSheet}
                        className="text-[11px] font-semibold text-red-700 hover:text-red-900 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowChangeSheetModal(false)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}


      <div
        className="w-full min-w-0 max-w-full overflow-auto overscroll-contain rounded-md [scrollbar-width:thin] [-webkit-overflow-scrolling:touch] max-h-[70dvh] md:max-h-[72dvh] lg:h-[calc(100dvh-145px)] lg:max-h-none"
        style={{
          touchAction: "pan-x pan-y",
          WebkitOverflowScrolling: "touch",
          scrollbarGutter: "stable"
        }}
      >
        <table className="min-w-[1080px] table-fixed border-collapse text-center text-xs md:text-sm">
          <colgroup>
            <col style={{ width: columnWidths.serial }} />
            <col style={{ width: columnWidths.customerName }} />
            <col style={{ width: columnWidths.shift }} />
            {columnWidths.days.map((width, index) => (
              <col key={`day-col-width-${index}`} style={{ width }} />
            ))}
            <col style={{ width: columnWidths.total }} />
          </colgroup>
          <thead className="bg-slate-100 font-semibold text-slate-800">
            <tr>
              <th
                style={{ width: columnWidths.serial, position: "relative" }}
                className="lg:sticky lg:top-0 z-20 border border-slate-400 bg-slate-100 px-1 py-2 sm:px-1.5"
              >
                S No
                <span
                  onPointerDown={(event) => startColumnResize("serial", columnWidths.serial, event)}
                  className="absolute inset-y-0 right-0 z-30 w-2 cursor-col-resize touch-none"
                  aria-hidden="true"
                />
              </th>
              <th
                style={{ width: columnWidths.customerName, position: "relative" }}
                className="lg:sticky lg:top-0 lg:left-0 z-30 border border-slate-400 bg-slate-100 px-1 py-2 sm:px-1.5"
              >
                Customer Name
                <span
                  onPointerDown={(event) => startColumnResize("customerName", columnWidths.customerName, event)}
                  className="absolute inset-y-0 right-0 z-40 w-2 cursor-col-resize touch-none"
                  aria-hidden="true"
                />
              </th>
              <th
                style={{ width: columnWidths.shift, position: "relative" }}
                className="lg:sticky lg:top-0 z-20 border border-slate-400 bg-slate-100 px-1 py-2 sm:px-1.5"
              >
                Shift
                <span
                  onPointerDown={(event) => startColumnResize("shift", columnWidths.shift, event)}
                  className="absolute inset-y-0 right-0 z-30 w-2 cursor-col-resize touch-none"
                  aria-hidden="true"
                />
              </th>
              {Array.from({ length: dayCount }, (_, index) => {
                const isSelected = selectedDayIndices.includes(index);
                return (
                  <th
                    key={`day-${index + 1}`}
                    draggable
                    onDragStart={(event) => handleDayColumnDragStart(index, event)}
                    onDragOver={(event) => handleDayColumnDragOver(index, event)}
                    onDrop={(event) => handleDayColumnDrop(index, event)}
                    onDragEnd={clearDragState}
                    style={{ width: columnWidths.days[index] }}
                    className={`sticky top-0 z-50 border border-slate-400 px-1 py-2 sm:px-1.5 lg:relative lg:top-auto lg:z-20 ${
                      isSelected ? "bg-blue-200 text-blue-950" : "bg-slate-100"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(event) => selectDayColumn(index, event)}
                      aria-label={`Select Day ${index + 1} column`}
                      title="Click to select. Drag this Day header to move the column left or right."
                      className="flex min-h-10 w-full cursor-pointer select-none flex-col items-center justify-center rounded px-1 text-center hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <span>Day {index + 1}</span>
                    </button>
                    <span
                      onPointerDown={(event) => startColumnResize(`day:${index}`, columnWidths.days[index], event)}
                      className="absolute inset-y-0 right-0 z-30 w-2 cursor-col-resize touch-none"
                      aria-hidden="true"
                    />
                  </th>
                );
              })}
              <th
                style={{ width: columnWidths.total, position: "relative" }}
                className="lg:sticky lg:top-0 z-20 border border-slate-400 bg-slate-100 px-1 py-2 sm:px-1.5"
              >
                Total
                <span
                  onPointerDown={(event) => startColumnResize("total", columnWidths.total, event)}
                  className="absolute inset-y-0 right-0 z-30 w-2 cursor-col-resize touch-none"
                  aria-hidden="true"
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const displaySerialNumbers = buildDisplaySerialMap(rows);
              const groupStartIndices = buildGroupStartIndices(rows);
              const nameCellSpans = buildNameCellSpans(groupStartIndices);
              const combinedTotals = buildCombinedTotals(rows, groupStartIndices);
              return rows.map((row, rowIndex) => {
              const total = row.days.reduce((sum, value) => sum + value, 0);
              const nameSpan = nameCellSpans[rowIndex];
              const displayTotal = nameSpan > 1 ? combinedTotals[rowIndex] : total;

              const isRowSelected = selectedRowIndices.includes(rowIndex);
              const groupStart = groupStartIndices[rowIndex] ?? rowIndex;
              const groupEnd = groupStart + Math.max(1, nameSpan || 1) - 1;
              const isGroupSelected = Array.from(
                { length: Math.max(1, groupEnd - groupStart + 1) },
                (_, index) => groupStart + index
              ).every((index) => selectedRowIndices.includes(index));

              return (
                <tr
                  key={`${row.serialNumber}-${rowIndex}`}
                  style={{ height: rowHeights[rowIndex] ?? DEFAULT_ROW_HEIGHT }}
                  className={isRowSelected ? "bg-blue-50" : "bg-white"}
                >
                  {nameSpan > 0 && (
                    <td
                      rowSpan={nameSpan}
                      draggable
                      onDragStart={(event) => handleRowDragStart(rowIndex, event)}
                      onDragOver={(event) => handleRowDragOver(rowIndex, event)}
                      onDrop={(event) => handleRowDrop(rowIndex, event)}
                      onDragEnd={clearDragState}
                      onClick={(event) => selectRow(rowIndex, event)}
                      style={{ height: rowHeights[rowIndex] ?? DEFAULT_ROW_HEIGHT, position: "relative", verticalAlign: "middle" }}
                      className={`cursor-grab select-none border border-slate-300 px-1 py-1 md:px-2 font-semibold align-middle ${
                        activeDrag?.kind === "row" && activeDrag.sourceIndex === getGroupBounds(rowIndex).start
                          ? "opacity-50"
                          : dragOverIndex === getGroupBounds(rowIndex).start && activeDrag?.kind === "row"
                          ? "ring-2 ring-blue-500 ring-inset"
                          : ""
                      } ${
                        isGroupSelected ? "bg-blue-200 text-blue-950 font-bold" : "bg-slate-50 hover:bg-blue-100"
                      }`}
                      aria-label={`Select row ${displaySerialNumbers[rowIndex] || rowIndex + 1}`}
                      title="Click to select the whole customer row group. Click a Shift cell to select only that shift."
                    >
                      <div className="flex min-h-9 w-full items-center justify-center rounded px-2 text-center">
                        {displaySerialNumbers[rowIndex]}
                      </div>
                      <div
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          startRowResize(rowIndex, rowHeights[rowIndex] ?? DEFAULT_ROW_HEIGHT, event);
                        }}
                        className="absolute bottom-0 left-0 z-[70] h-3 w-full cursor-row-resize touch-none rounded-sm bg-transparent hover:bg-slate-300/40"
                        style={{ touchAction: "none", pointerEvents: "auto", cursor: "row-resize" }}
                        aria-label={`Resize row ${rowIndex + 1}`}
                        role="separator"
                        aria-orientation="horizontal"
                      />
                    </td>
                  )}
                  {nameSpan > 0 && (
                    <td
                      rowSpan={nameSpan}
                      style={{ height: rowHeights[rowIndex] ?? DEFAULT_ROW_HEIGHT, verticalAlign: "middle" }}
                      className={`sticky left-0 z-10 border border-slate-300 px-1 py-1 md:px-2 align-middle ${
                        isGroupSelected ? "bg-blue-100" : "bg-white"
                      }`}
                    >
                      <input
                        value={row.customerName}
                        onChange={(event) => updateCustomerName(row.serialNumber, event.target.value)}
                        className={`h-9 w-full min-w-0 rounded border border-slate-300 px-2 py-1 text-left ${isRowSelected ? "bg-blue-50" : "bg-white"}`}
                      />
                    </td>
                  )}
                  <td
                    onDoubleClick={(event) => selectSingleShiftRow(rowIndex, event)}
                    style={{ height: rowHeights[rowIndex] ?? DEFAULT_ROW_HEIGHT, position: "relative", verticalAlign: "middle" }}
                    className={`border border-slate-300 px-1 py-1 md:px-2 ${isRowSelected ? "bg-blue-100" : "bg-white"}`}
                    title="Double-click this Shift cell to select only this shift row for deletion. Single click edits normally."
                  >
                    <input
                      value={row.shift}
                      onChange={(event) => updateShift(row.serialNumber, event.target.value)}
                      className={`h-9 w-full rounded border border-slate-300 px-2 py-1 text-center ${isRowSelected ? "bg-blue-50" : "bg-white"}`}
                    />
                    </td>
                  {row.days.map((value, dayIndex) => (
                    <td
                      key={`${row.serialNumber}-${dayIndex + 1}`}
                      style={{ height: rowHeights[rowIndex] ?? DEFAULT_ROW_HEIGHT, verticalAlign: "middle" }}
                      className={`border border-slate-300 px-1 py-1 ${
                        selectedDayIndices.includes(dayIndex)
                          ? "bg-blue-50"
                          : isRowSelected
                          ? "bg-blue-100"
                          : "bg-white"
                      }`}
                    >
                      <input
                        type="text"
                        inputMode="text"
                        value={
                          editingDayCell &&
                          editingDayCell.serialNumber === row.serialNumber &&
                          editingDayCell.dayIndex === dayIndex
                            ? editingDayCell.text
                            : value === 0
                            ? ""
                            : String(value)
                        }
                        onFocus={() =>
                          setEditingDayCell({
                            serialNumber: row.serialNumber,
                            dayIndex,
                            text: value === 0 ? "" : String(value)
                          })
                        }
                        onChange={(event) =>
                          setEditingDayCell({
                            serialNumber: row.serialNumber,
                            dayIndex,
                            text: event.target.value
                          })
                        }
                        onKeyDown={(event) => {
                          // Pressing Enter commits the typed expression (e.g. "2+3+5")
                          // as its summed total, same as clicking away from the cell.
                          if (event.key === "Enter") {
                            event.currentTarget.blur();
                          }
                        }}
                        onBlur={(event) => {
                          updateDayValue(row.serialNumber, dayIndex, event.target.value);
                          setEditingDayCell(null);
                        }}
                        className={`h-9 w-full rounded border border-slate-300 px-2 py-1 text-center ${selectedDayIndices.includes(dayIndex) ? "bg-blue-100" : isRowSelected ? "bg-blue-50" : "bg-white"}`}
                      />
                    </td>
                  ))}
                  {nameSpan > 0 && (
                    <td
                      rowSpan={nameSpan}
                      style={{ height: rowHeights[rowIndex] ?? DEFAULT_ROW_HEIGHT, verticalAlign: "middle" }}
                      className={`border border-slate-300 px-1 py-1 font-semibold md:px-2 ${
                        isGroupSelected ? "bg-blue-100" : "bg-white"
                      }`}
                    >
                      {displayTotal}
                    </td>
                  )}
                </tr>
              );
            });
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CustomerTable;
