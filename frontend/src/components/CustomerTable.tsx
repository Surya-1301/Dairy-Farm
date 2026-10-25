import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { getCustomers, subscribeCustomersChanged, notifyCustomersChanged } from "../utils/customerData";
import { notifyMilkDataChanged } from "../utils/milkData";

import { getActiveUser } from "../firebase/auth";
import { getSheetSearch, setSheetSearch, subscribeSheetSearch } from "../utils/sheetSearch";
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
  const hasMorning = group.some((customer) => customer.shift === "M");
  const hasEvening = group.some((customer) => customer.shift === "E");

  // 1. Both M + E
  if (hasMorning && hasEvening) return 0;

  // 2. Morning only
  if (hasMorning) return 1;

  // 3. Evening only
  if (hasEvening) return 2;

  return 3;
}

function sortCustomerGroups(groups: Customer[][]): Customer[][] {
  return [...groups].sort((a, b) => {
    // On refresh, keep the sheet in the same customer priority order:
    // 1. Customers with both Morning (M) and Evening (E)
    // 2. Morning-only customers
    // 3. Evening-only customers
    const priorityDifference =
      getGroupShiftPriority(a) - getGroupShiftPriority(b);

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    // Keep the existing customer order inside each priority group.
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


export const BACK_TO_CURRENT_SHEET_EVENT = "dairy-farm:back-to-current-sheet";

type DailyCustomerGroup = {
  key: string;
  customerName: string;
  displaySerial: string;
  rows: {
    row: SheetRow;
    rowIndex: number;
  }[];
};

function buildDailyCustomerGroups(
  visibleRowIndices: number[],
  allRows: SheetRow[],
  displaySerials: string[]
): DailyCustomerGroup[] {
  const groups: DailyCustomerGroup[] = [];
  const map = new Map<string, DailyCustomerGroup>();

  visibleRowIndices.forEach((rowIndex) => {
    const row = allRows[rowIndex];
    const trimmedName = (row.customerName || "").trim();
    // Only show cards for customers that have an inputted name
    if (!trimmedName) {
      return;
    }

    const groupKey = trimmedName.toLowerCase();

    let group = map.get(groupKey);
    if (!group) {
      group = {
        key: groupKey,
        customerName: trimmedName,
        displaySerial: displaySerials[rowIndex] || String(rowIndex + 1),
        rows: []
      };
      map.set(groupKey, group);
      groups.push(group);
    }
    group.rows.push({ row, rowIndex });
  });

  return groups;
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
  const [customerSearch, setCustomerSearch] = useState(getSheetSearch);
  const undoStackRef = useRef<SheetState[]>([]);
  const redoStackRef = useRef<SheetState[]>([]);

  // Mobile View Enhancements State
  const [mobileViewMode, setMobileViewMode] = useState<"daily" | "table">(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      return "daily";
    }
    return "table";
  });
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [dailyShiftFilter, setDailyShiftFilter] = useState<"All" | "M" | "E">("All");
  const [showMobileActionMenu, setShowMobileActionMenu] = useState(false);
  const [focusedCell, setFocusedCell] = useState<{
    serialNumber: number;
    rowIndex: number;
    dayIndex: number;
  } | null>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const dailyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const tableInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [shiftToDelete, setShiftToDelete] = useState<{
    row: SheetRow;
    rowIndex: number;
  } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerShift, setNewCustomerShift] = useState<"Both" | "M" | "E">("Both");
  const [addCustomerError, setAddCustomerError] = useState("");

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
      const activeUser = getActiveUser();

      if (!activeUser?.email) {
        return;
      }

      // Always normalize the master customer order first so the Customers page
      // and the sheet use exactly the same ordering.
      const orderedCustomers = getOrderedCustomers(customers);
      const reorderedCustomers = orderedCustomers.map((customer, index) => ({
        ...customer,
        serialNumber: index + 1
      }));

      const masterOrderChanged =
        customers.length !== reorderedCustomers.length ||
        reorderedCustomers.some((customer, index) => {
          const current = customers[index];
          return (
            !current ||
            current.serialNumber !== customer.serialNumber ||
            current.name !== customer.name ||
            current.shift !== customer.shift
          );
        });

      if (masterOrderChanged) {
        await saveCustomersByEmail(activeUser.email, reorderedCustomers);
        notifyCustomersChanged();
      }

      setSheetState((prev) => {
        const { dayCount: prevDayCount, rows: prevRows } = prev;

        if (reorderedCustomers.length === 0) {
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

          const fallbackRows = normalizeRows(
            createInitialSheet().rows,
            prevDayCount
          );
          const fallbackState = {
            dayCount: prevDayCount,
            rows: fallbackRows
          };

          queueAutoSave(fallbackState, null);
          setRowHeights((current) =>
            normalizeRowHeights(current, fallbackRows.length)
          );
          return fallbackState;
        }

        // Match existing day data by name+shift rather than array position so
        // moving a customer between M/E priority groups never changes values.
        const existingRowByKey = new Map<string, SheetRow>();
        prevRows.forEach((row) => {
          const key = getSheetCustomerKey(row);
          existingRowByKey.set(key, row);
        });

        const namedRows = reorderedCustomers.map((customer, index) => {
          const key = `${customer.name.trim().toLowerCase()}|${customer.shift
            .trim()
            .toUpperCase()}`;
          const existingRow = existingRowByKey.get(key);

          return {
            serialNumber: index + 1,
            customerName: customer.name || "",
            shift: customer.shift || existingRow?.shift || "",
            days: Array.from(
              { length: prevDayCount },
              (_, dayIndex) => existingRow?.days?.[dayIndex] ?? 0
            )
          };
        });

        const targetRowCount = Math.max(
          namedRows.length,
          prevRows.length,
          1
        );
        const nextRows = [...namedRows];

        for (let i = namedRows.length; i < targetRowCount; i += 1) {
          nextRows.push(createEmptyRow(i + 1, prevDayCount));
        }

        const changed =
          nextRows.length !== prevRows.length ||
          nextRows.some(
            (row, index) =>
              row.customerName !== prevRows[index]?.customerName ||
              row.shift !== prevRows[index]?.shift
          );

        if (changed) {
          const nextState = {
            dayCount: prevDayCount,
            rows: nextRows
          };

          queueAutoSave(nextState, null);
          setRowHeights((current) =>
            normalizeRowHeights(current, nextRows.length)
          );
          notifyMilkDataChanged();
          return nextState;
        }

        return prev;
      });
    })().catch((error) => {
      console.error("Failed to synchronize customers and sheet order:", error);
    });
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

  const scrollToInputOnMobile = (element: HTMLElement | null) => {
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    window.setTimeout(() => {
      element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }, 180);
  };

  const handleFocusNext = () => {
    if (!focusedCell) return;
    const q = customerSearch.trim().toLowerCase();
    const visibleIndices = rows
      .map((_, idx) => idx)
      .filter((idx) => {
        const hasName = Boolean(rows[idx].customerName && rows[idx].customerName.trim());
        const matchesQuery = !q || rows[idx].customerName.toLowerCase().includes(q);
        return hasName && matchesQuery;
      });

    const currentPos = visibleIndices.indexOf(focusedCell.rowIndex);
    if (currentPos !== -1 && currentPos < visibleIndices.length - 1) {
      const nextRowIndex = visibleIndices[currentPos + 1];
      const nextRow = rows[nextRowIndex];
      setFocusedCell({
        serialNumber: nextRow.serialNumber,
        rowIndex: nextRowIndex,
        dayIndex: focusedCell.dayIndex
      });
      const nextInput =
        dailyInputRefs.current[`${nextRow.serialNumber}-${focusedCell.dayIndex}`] ||
        tableInputRefs.current[`${nextRow.serialNumber}-${focusedCell.dayIndex}`];
      if (nextInput) {
        nextInput.focus();
        scrollToInputOnMobile(nextInput);
      }
    }
  };

  const jumpToDay = (startDay: number) => {
    if (!tableContainerRef.current) return;
    const scrollPosition = Math.max(0, (startDay - 1) * 60);
    tableContainerRef.current.scrollTo({
      left: scrollPosition,
      behavior: "smooth"
    });
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

  const handleAddCustomer = (name: string, shift: "Both" | "M" | "E") => {
    const trimmed = name.trim();
    if (!trimmed) return;

    const rowsToAdd: SheetRow[] = [];
    if (shift === "Both") {
      rowsToAdd.push({
        serialNumber: 0,
        customerName: trimmed,
        shift: "M",
        days: Array.from({ length: dayCount }, () => 0)
      });
      rowsToAdd.push({
        serialNumber: 0,
        customerName: trimmed,
        shift: "E",
        days: Array.from({ length: dayCount }, () => 0)
      });
    } else {
      rowsToAdd.push({
        serialNumber: 0,
        customerName: trimmed,
        shift,
        days: Array.from({ length: dayCount }, () => 0)
      });
    }

    const activeRows = rows.filter(
      (r) => r.customerName.trim() !== "" || r.days.some((d) => d > 0)
    );

    const combined = [...activeRows, ...rowsToAdd];
    const nextRows = combined.map((row, index) => ({
      ...row,
      serialNumber: index + 1
    }));

    saveState({ dayCount, rows: nextRows });
    setRowHeights((current) => normalizeRowHeights(current, nextRows.length));
    setShowAddCustomerModal(false);
    setNewCustomerName("");
    setNewCustomerShift("Both");
    setAddCustomerError("");
  };

  const deleteShiftRow = (rowIndex: number) => {
    if (rows.length <= 1) return;
    const nextRows = rows
      .filter((_, index) => index !== rowIndex)
      .map((row, index) => ({
        ...row,
        serialNumber: index + 1
      }));

    saveState({ dayCount, rows: nextRows });
    setRowHeights((current) => current.filter((_, index) => index !== rowIndex));
    setSelectedRowIndices((current) =>
      current.filter((i) => i !== rowIndex).map((i) => (i > rowIndex ? i - 1 : i))
    );
  };

  const startShiftLongPress = (row: SheetRow, rowIndex: number, clientX: number, clientY: number) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    touchStartPosRef.current = { x: clientX, y: clientY };
    longPressTimerRef.current = setTimeout(() => {
      try {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(40);
        }
      } catch {
        // ignore vibration error
      }
      setShiftToDelete({ row, rowIndex });
      longPressTimerRef.current = null;
    }, 500);
  };

  const cancelShiftLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPosRef.current = null;
  };

  const handleShiftTouchMove = (clientX: number, clientY: number) => {
    if (!touchStartPosRef.current) return;
    const dx = Math.abs(clientX - touchStartPosRef.current.x);
    const dy = Math.abs(clientY - touchStartPosRef.current.y);
    if (dx > 10 || dy > 10) {
      cancelShiftLongPress();
    }
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

  // Header back-arrow (shown only while an archived sheet is open) triggers
  // this via a window event, since the header lives in Layout.
  // The header search input (tablet/mobile) also writes to this shared store.
  useEffect(() => {
    return subscribeSheetSearch(() => setCustomerSearch(getSheetSearch()));
  }, []);
  useEffect(() => {
    const handleBackEvent = () => {
      void backToCurrentSheet();
    };
    window.addEventListener(BACK_TO_CURRENT_SHEET_EVENT, handleBackEvent);
    return () => window.removeEventListener(BACK_TO_CURRENT_SHEET_EVENT, handleBackEvent);
  });

  const searchQuery = customerSearch.trim().toLowerCase();
  const visibleRowIndices = rows
    .map((_, rowIndex) => rowIndex)
    .filter((rowIndex) =>
      searchQuery ? rows[rowIndex].customerName.toLowerCase().includes(searchQuery) : true
    );
  const displaySerialNumbers = buildDisplaySerialMap(rows);
  const dailyGroups = buildDailyCustomerGroups(visibleRowIndices, rows, displaySerialNumbers);

  return (
    <div className="flex h-auto w-full max-w-none flex-col space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-card dark:bg-[#212121] dark:border-[#333] md:relative md:left-1/2 md:-translate-x-1/2 md:-mt-8 md:h-[calc(100dvh-4.5rem)] md:w-screen md:space-y-2 md:rounded-none md:border-0 md:bg-white dark:md:bg-[#161616] md:pt-2 md:px-0 md:pb-0 md:shadow-none">
      {/* Mobile Top Controls (< md only) */}
      <div className="flex flex-col gap-2.5 md:hidden">
        <div className="flex items-center justify-between gap-2">
          {/* Segmented Mode Switcher */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-white/10">
            <button
              type="button"
              onClick={() => setMobileViewMode("daily")}
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-900 shadow-sm transition dark:bg-[#2c2c2c] dark:text-white"
            >
              <span>📅</span>
              <span>Daily Entry</span>
            </button>
            {/* Table section temporarily hidden on mobile */}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openSaveNameModal}
              className="flex min-h-[40px] items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-sm active:scale-95 touch-manipulation cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              <span>Save</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowMobileActionMenu(true);
              }}
              aria-label="Open sheet actions"
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-sm font-bold text-slate-700 shadow-sm transition active:scale-95 touch-manipulation dark:border-[#444] dark:bg-[#2a2a2a] dark:text-slate-200"
            >
              •••
            </button>
          </div>
        </div>

        {/* Mobile Search */}
        <div className="relative w-full">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="search"
            value={customerSearch}
            onChange={(event) => setSheetSearch(event.target.value)}
            placeholder="Search customer name..."
            aria-label="Search customer name"
            className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-9 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-[#444] dark:bg-[#1c1c1c] dark:text-white dark:placeholder:text-slate-500"
          />
          {customerSearch ? (
            <button
              type="button"
              onClick={() => setSheetSearch("")}
              aria-label="Clear customer search"
              className="absolute inset-y-0 right-2 flex items-center rounded-full px-2 text-lg leading-none text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      {/* Desktop & Tablet Toolbar (Original toolbar preserved for md: & lg:) */}
      <div className="hidden md:grid md:grid-cols-3 md:gap-2 lg:flex lg:flex-row lg:items-start lg:justify-between lg:gap-4">
        <div className="contents lg:flex lg:flex-wrap lg:overflow-visible lg:mx-0 lg:px-0 lg:items-center lg:gap-2">
          <button
            type="button"
            onClick={addRow}
            className="w-full min-w-0 min-h-[48px] rounded-full bg-brand-500 lg:w-auto px-1.5 py-2 text-[10px] sm:text-[11px] lg:text-[12px] font-semibold text-white active:scale-95 touch-manipulation whitespace-nowrap"
          >
            Add Row
          </button>
          <button
            type="button"
            onClick={removeRow}
            disabled={rows.length <= 1}
            className="w-full min-w-0 min-h-[48px] rounded-full border border-red-500 lg:w-auto bg-red-500 px-1.5 py-2 text-[10px] sm:text-[11px] lg:text-[12px] font-semibold text-white active:scale-95 disabled:opacity-50 touch-manipulation whitespace-nowrap"
          >
            Remove Row
          </button>
          <button
            type="button"
            onClick={removeSelectedRows}
            disabled={selectedRowIndices.length === 0 || rows.length - selectedRowIndices.length < 1}
            className="w-full min-w-0 min-h-[48px] rounded-full border border-rose-600 lg:w-auto bg-rose-600 px-1.5 py-2 text-[10px] sm:text-[11px] lg:text-[12px] font-semibold text-white active:scale-95 disabled:opacity-50 touch-manipulation whitespace-nowrap"
          >
            Delete Row{selectedRowIndices.length ? ` (${selectedRowIndices.length})` : ""}
          </button>
          <button
            type="button"
            onClick={addColumn}
            className="w-full min-w-0 min-h-[48px] rounded-full bg-brand-500 lg:w-auto px-1.5 py-2 text-[10px] sm:text-[11px] lg:text-[12px] font-semibold text-white active:scale-95 touch-manipulation whitespace-nowrap"
          >
            Add Column
          </button>
          <button
            type="button"
            onClick={removeColumn}
            disabled={dayCount <= 1}
            className="w-full min-w-0 min-h-[48px] rounded-full border border-red-500 lg:w-auto bg-red-500 px-1.5 py-2 text-[10px] sm:text-[11px] lg:text-[12px] font-semibold text-white active:scale-95 disabled:opacity-50 touch-manipulation whitespace-nowrap"
          >
            Remove Column
          </button>
          <button
            type="button"
            onClick={removeSelectedColumns}
            disabled={selectedDayIndices.length === 0 || dayCount - selectedDayIndices.length < 1}
            className="w-full min-w-0 min-h-[48px] rounded-full border border-rose-600 lg:w-auto bg-rose-600 px-1.5 py-2 text-[10px] sm:text-[11px] lg:text-[12px] font-semibold text-white active:scale-95 disabled:opacity-50 touch-manipulation whitespace-nowrap"
          >
            Delete Column{selectedDayIndices.length ? ` (${selectedDayIndices.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => void archiveToHistory("")}
            className="w-full min-w-0 min-h-[48px] rounded-full border border-amber-500 lg:w-auto bg-amber-500 px-1.5 py-2 text-[10px] sm:text-[11px] lg:text-[12px] font-semibold text-white active:scale-95 touch-manipulation whitespace-nowrap"
          >
            Archive
          </button>
          <button
            type="button"
            onClick={openChangeSheetModal}
            className="w-full min-w-0 min-h-[48px] rounded-full border border-indigo-500 lg:w-auto bg-indigo-500 px-1.5 py-2 text-[10px] sm:text-[11px] lg:text-[12px] font-semibold text-white active:scale-95 touch-manipulation whitespace-nowrap"
          >
            Archived Sheets
          </button>
        </div>
        <div className="contents lg:flex lg:items-center lg:gap-2">
          <button
            type="button"
            onClick={openSaveNameModal}
            className={`order-9 w-full min-w-0 min-h-[48px] rounded-full border border-emerald-500 bg-emerald-500 px-1.5 py-2 text-[10px] sm:text-[11px] lg:text-[12px] font-semibold text-white active:scale-95 touch-manipulation whitespace-nowrap lg:order-2 lg:w-auto ${activeHistoryId ? "" : "lg:min-w-[180px]"}`}
          >
            Save to History
          </button>
          <div className="relative hidden order-8 lg:order-1 lg:flex w-full min-w-0 flex-1 lg:min-w-[220px]">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <input
              type="search"
              value={customerSearch}
              onChange={(event) => setSheetSearch(event.target.value)}
              placeholder="Search customer name..."
              aria-label="Search customer name"
              className="min-h-[48px] w-full flex-1 rounded-full border border-slate-300 bg-white py-2 pl-9 pr-9 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 sm:text-[11px] lg:text-[12px] dark:border-[#444] dark:bg-[#1c1c1c] dark:text-white dark:placeholder:text-slate-500"
            />
            {customerSearch ? (
              <button
                type="button"
                onClick={() => setSheetSearch("")}
                aria-label="Clear customer search"
                className="absolute inset-y-0 right-2 flex items-center rounded-full px-2 text-lg leading-none text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              >
                ×
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {showSaveNameModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="save-sheet-title">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl dark:border dark:border-[#444] dark:bg-[#212121] sm:p-5">
            <h3 id="save-sheet-title" className="text-base font-semibold text-slate-800 dark:text-white">Name this sheet</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Give this saved sheet a name so it's easy to find in History.</p>
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
              className="mt-3 h-12 w-full rounded-xl border border-slate-300 px-3 text-base dark:border-[#444] dark:bg-[#1c1c1c] dark:text-white"
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowSaveNameModal(false)}
                className="min-h-12 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-[#444] dark:text-slate-200 dark:hover:bg-[#2a2a2a]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSaveToHistory}
                className="min-h-12 rounded-xl border border-emerald-400 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
              >
                Save
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showChangeSheetModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black/60 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="archived-sheets-title">
          <div className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-md flex-col overflow-hidden rounded-2xl bg-white p-3 shadow-2xl dark:border dark:border-[#444] dark:bg-[#212121] sm:p-4">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 id="archived-sheets-title" className="text-base font-semibold text-slate-800 dark:text-white">Archived sheets</h3>
                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">Open a saved sheet to edit it.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowChangeSheetModal(false)}
                className="rounded-lg px-2 py-1 text-lg leading-none text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#2a2a2a]"
                aria-label="Close change sheet dialog"
              >
                ×
              </button>
            </div>
            {historyLoading ? (
              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Loading saved sheets...</p>
            ) : archivedEntries.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No saved sheets found. Save a sheet to History first.</p>
            ) : (
              <div className="mt-4 min-h-0 max-h-[calc(100dvh-10rem)] space-y-2 overflow-y-auto overscroll-contain pr-1">
                {archivedEntries.map((entry, index) => (
                  <div
                    key={entry.id}
                    className="min-h-[64px] w-full rounded-xl border border-slate-200 px-3 py-3 text-left dark:border-[#444]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-800 dark:text-white">{entry.name || `Sheet ${archivedEntries.length - index}`}</span>
                        <span className="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">Saved {new Date(entry.savedAt).toLocaleString()}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void changeSheet(entry)}
                        disabled={changingSheet}
                        className="min-h-10 rounded-lg px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-blue-300 dark:hover:bg-blue-950/30"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteArchivedSheet(entry)}
                        disabled={changingSheet}
                        className="min-h-10 rounded-lg px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-300 dark:hover:bg-red-950/30"
                      >
                        Delete
                      </button>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex justify-end sm:mt-4">
              <button
                type="button"
                onClick={() => setShowChangeSheetModal(false)}
                className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-[#444] dark:text-slate-200 dark:hover:bg-[#2a2a2a]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Mobile Sheet Actions Menu Drawer */}
      {showMobileActionMenu && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[150] flex items-end justify-center bg-black/60 backdrop-blur-sm p-0 sm:items-center sm:p-4 md:hidden"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowMobileActionMenu(false);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl dark:border dark:border-[#444] dark:bg-[#212121] sm:rounded-2xl"
            style={{ paddingBottom: "max(1.75rem, env(safe-area-inset-bottom, 24px))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/10">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {mobileViewMode === "table" ? "Table Actions" : "Sheet Actions"}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {mobileViewMode === "table" ? "Manage rows, columns, and history" : "Add customers and manage history"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMobileActionMenu(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-500 hover:bg-slate-200 active:scale-95 touch-manipulation dark:bg-white/10 dark:text-slate-300"
                aria-label="Close sheet actions"
              >
                ✕
              </button>
            </div>

            {mobileViewMode === "table" ? (
              /* Restored full original actions for Table version */
              <div className="mt-4 grid grid-cols-2 gap-2.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    addRow();
                    setShowMobileActionMenu(false);
                  }}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-800 hover:bg-slate-100 active:scale-95 touch-manipulation dark:border-[#444] dark:bg-white/5 dark:text-white"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">+</span>
                  <span>Add Row</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    addColumn();
                    setShowMobileActionMenu(false);
                  }}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-800 hover:bg-slate-100 active:scale-95 touch-manipulation dark:border-[#444] dark:bg-white/5 dark:text-white"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">+</span>
                  <span>Add Day Column</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    removeRow();
                    setShowMobileActionMenu(false);
                  }}
                  disabled={rows.length <= 1}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-800 hover:bg-slate-100 active:scale-95 disabled:opacity-50 touch-manipulation dark:border-[#444] dark:bg-white/5 dark:text-white"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-200 font-bold text-slate-700 dark:bg-white/10 dark:text-slate-300">−</span>
                  <span>Remove Row</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    removeColumn();
                    setShowMobileActionMenu(false);
                  }}
                  disabled={dayCount <= 1}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-800 hover:bg-slate-100 active:scale-95 disabled:opacity-50 touch-manipulation dark:border-[#444] dark:bg-white/5 dark:text-white"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-200 font-bold text-slate-700 dark:bg-white/10 dark:text-slate-300">−</span>
                  <span>Remove Column</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    removeSelectedRows();
                    setShowMobileActionMenu(false);
                  }}
                  disabled={selectedRowIndices.length === 0 || rows.length - selectedRowIndices.length < 1}
                  className="col-span-2 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700 hover:bg-rose-100 active:scale-95 disabled:opacity-40 touch-manipulation dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
                >
                  <span className="flex items-center gap-2">
                    <span>🗑️</span>
                    <span>Delete Selected Rows</span>
                  </span>
                  <span className="rounded-full bg-rose-200/70 px-2 py-0.5 text-[11px] font-bold text-rose-800 dark:bg-rose-900 dark:text-rose-200">
                    {selectedRowIndices.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    removeSelectedColumns();
                    setShowMobileActionMenu(false);
                  }}
                  disabled={selectedDayIndices.length === 0 || dayCount - selectedDayIndices.length < 1}
                  className="col-span-2 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700 hover:bg-rose-100 active:scale-95 disabled:opacity-40 touch-manipulation dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
                >
                  <span className="flex items-center gap-2">
                    <span>🗑️</span>
                    <span>Delete Selected Columns</span>
                  </span>
                  <span className="rounded-full bg-rose-200/70 px-2 py-0.5 text-[11px] font-bold text-rose-800 dark:bg-rose-900 dark:text-rose-200">
                    {selectedDayIndices.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowMobileActionMenu(false);
                    void archiveToHistory("");
                  }}
                  className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800 hover:bg-amber-100 active:scale-95 touch-manipulation dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300"
                >
                  <span>📁</span>
                  <span>Archive</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowMobileActionMenu(false);
                    openChangeSheetModal();
                  }}
                  className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-indigo-800 hover:bg-indigo-100 active:scale-95 touch-manipulation dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-300"
                >
                  <span>🗄️</span>
                  <span>Archived Sheets</span>
                </button>
              </div>
            ) : (
              /* Daily Entry Mode Actions */
              <div className="mt-4 grid grid-cols-2 gap-2.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileActionMenu(false);
                    setNewCustomerName("");
                    setNewCustomerShift("Both");
                    setAddCustomerError("");
                    setShowAddCustomerModal(true);
                  }}
                  className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-brand-500 p-3.5 text-xs font-bold text-white shadow-sm hover:bg-brand-600 active:scale-95 touch-manipulation"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/20 text-base font-extrabold">+</span>
                  <span>Add Customer</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowMobileActionMenu(false);
                    void archiveToHistory("");
                  }}
                  className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800 hover:bg-amber-100 active:scale-95 touch-manipulation dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300"
                >
                  <span>📁</span>
                  <span>Archive</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowMobileActionMenu(false);
                    openChangeSheetModal();
                  }}
                  className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-indigo-800 hover:bg-indigo-100 active:scale-95 touch-manipulation dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-300"
                >
                  <span>🗄️</span>
                  <span>Archived Sheets</span>
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Add Customer Modal with Shift Option */}
      {showAddCustomerModal && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowAddCustomerModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:border dark:border-[#444] dark:bg-[#212121]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/10">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-blue-600/20 dark:text-blue-400 font-bold">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Add Customer</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Add customer to the milk sheet</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCustomerModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-500 hover:bg-slate-200 active:scale-95 touch-manipulation dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/20"
                aria-label="Close add customer dialog"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newCustomerName.trim()) {
                  setAddCustomerError("Please enter a customer name.");
                  return;
                }
                handleAddCustomer(newCustomerName, newCustomerShift);
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Customer Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newCustomerName}
                  onChange={(e) => {
                    setNewCustomerName(e.target.value);
                    if (addCustomerError) setAddCustomerError("");
                  }}
                  placeholder="e.g. Ramesh Kumar"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-[#555] dark:bg-[#1a1a1a] dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/30"
                />
                {addCustomerError ? (
                  <p className="mt-1 text-xs text-rose-500 font-medium">{addCustomerError}</p>
                ) : null}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  Shift Option
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { value: "Both", label: "Both (M & E)" },
                      { value: "M", label: "Morning (M)" },
                      { value: "E", label: "Evening (E)" }
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setNewCustomerShift(option.value)}
                      className={`flex items-center justify-center rounded-xl border py-3 px-1 text-center transition active:scale-95 touch-manipulation ${
                        newCustomerShift === option.value
                          ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-500/30 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-500/40 font-bold"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-[#444] dark:bg-[#1a1a1a] dark:text-slate-300 dark:hover:bg-[#262626] font-medium"
                      }`}
                    >
                      <span className="text-xs leading-tight">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="min-h-11 rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 active:scale-95 touch-manipulation dark:border-[#444] dark:bg-[#1a1a1a] dark:text-slate-200 dark:hover:bg-[#2a2a2a]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-11 rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-600 active:scale-95 touch-manipulation dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  Add Customer
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Shift Confirmation Popup */}
      {shiftToDelete && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          onClick={() => setShiftToDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:border dark:border-[#444] dark:bg-[#212121]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete Shift?</h3>
                <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {shiftToDelete.row.customerName || `Customer ${shiftToDelete.row.serialNumber}`} • {shiftToDelete.row.shift === "M" ? "Morning" : shiftToDelete.row.shift === "E" ? "Evening" : shiftToDelete.row.shift || "Shift"}
                </p>
              </div>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Are you sure you want to delete this shift row from the milk sheet? This action will remove this entry.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setShiftToDelete(null)}
                className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 active:scale-95 touch-manipulation dark:border-[#444] dark:text-slate-200 dark:hover:bg-[#2a2a2a]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteShiftRow(shiftToDelete.rowIndex);
                  setShiftToDelete(null);
                }}
                className="min-h-11 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 active:scale-95 touch-manipulation"
              >
                Delete Shift
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Daily Quick Entry Mode View on Mobile */}
      <div className={`${mobileViewMode === "daily" ? "flex flex-col gap-3" : "hidden"} md:hidden w-full flex-1 min-h-0`}>
        {/* Day Stepper & Carousel */}
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-2.5 dark:border-[#333] dark:bg-white/5">
          <button
            type="button"
            onClick={() => setSelectedDayIndex((prev) => Math.max(0, prev - 1))}
            disabled={selectedDayIndex === 0}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white font-bold text-slate-700 shadow-sm disabled:opacity-30 active:scale-95 dark:border-[#444] dark:bg-[#252525] dark:text-white"
            aria-label="Previous Day"
          >
            ‹
          </button>
          <div className="text-center">
            <span className="block text-sm font-extrabold text-slate-900 dark:text-white">
              Day {selectedDayIndex + 1}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              of {dayCount} days
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedDayIndex((prev) => Math.min(dayCount - 1, prev + 1))}
            disabled={selectedDayIndex >= dayCount - 1}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white font-bold text-slate-700 shadow-sm disabled:opacity-30 active:scale-95 dark:border-[#444] dark:bg-[#252525] dark:text-white"
            aria-label="Next Day"
          >
            ›
          </button>
        </div>

        {/* Day Quick Select Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-webkit-overflow-scrolling:touch]">
          {Array.from({ length: dayCount }, (_, dIdx) => (
            <button
              key={`day-pill-${dIdx}`}
              type="button"
              onClick={() => setSelectedDayIndex(dIdx)}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition active:scale-95 ${
                selectedDayIndex === dIdx
                  ? "bg-brand-500 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 dark:border-[#444] dark:bg-white/5 dark:text-slate-300"
              }`}
            >
              Day {dIdx + 1}
            </button>
          ))}
        </div>

        {/* Shift Filter Pills */}
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold dark:bg-white/5">
          {(["All", "M", "E"] as const).map((shift) => (
            <button
              key={`shift-filter-${shift}`}
              type="button"
              onClick={() => setDailyShiftFilter(shift)}
              className={`rounded-lg py-1.5 text-center font-bold transition ${
                dailyShiftFilter === shift
                  ? "bg-white text-slate-900 shadow-sm dark:bg-[#2c2c2c] dark:text-white"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              {shift === "All" ? "All Shifts" : shift === "M" ? "Morning (M)" : "Evening (E)"}
            </button>
          ))}
        </div>

        {/* Customer Cards List */}
        <div className="flex flex-col gap-2.5 pr-0.5 pb-0">
          {(() => {
            const visibleDailyGroups = dailyGroups.filter((group) => {
              if (dailyShiftFilter === "All") return true;
              return group.rows.some(({ row }) => (row.shift || "").toUpperCase().includes(dailyShiftFilter));
            });

            if (visibleDailyGroups.length === 0) {
              return (
                <div className="flex flex-col gap-2.5">
                  <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500 dark:border-[#444] dark:text-slate-400">
                    No customers match your search or filter.
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-[#383838] dark:bg-[#1a1a1a]">
                    <div>
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Day {selectedDayIndex + 1} Total
                      </span>
                      <span className="font-mono text-base font-extrabold text-brand-600 dark:text-brand-400">
                        ₹{rows.reduce((sum, r) => sum + (r.days[selectedDayIndex] ?? 0), 0)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Total
                      </span>
                      <span className="font-mono text-base font-extrabold text-slate-900 dark:text-white">
                        ₹{rows.reduce((grand, r) => grand + r.days.reduce((s, v) => s + v, 0), 0)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }

            return visibleDailyGroups.map((group, groupIndex) => {
              const matchingRows = group.rows.filter(({ row }) => {
                if (dailyShiftFilter === "All") return true;
                return (row.shift || "").toUpperCase().includes(dailyShiftFilter);
              });
              if (matchingRows.length === 0) return null;

              const isLastCustomer = groupIndex === visibleDailyGroups.length - 1;
              const customerDayTotal = group.rows.reduce(
                (sum, { row }) => sum + (row.days[selectedDayIndex] || 0),
                0
              );

              return (
                <div
                  key={`daily-card-${group.key}`}
                  className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:shadow-md dark:border-[#383838] dark:bg-[#1a1a1a] scroll-my-28"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                        {group.displaySerial}
                      </span>
                      <span className="truncate font-bold text-sm text-slate-900 dark:text-white">
                        {group.customerName}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[10px] leading-tight text-slate-400">Day Total</span>
                      <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
                        ₹{Math.round(customerDayTotal * 100) / 100}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 touch-pan-y">
                    {matchingRows.map(({ row, rowIndex }) => {
                      const isMorning = (row.shift || "").toUpperCase().includes("M");
                      const isEvening = (row.shift || "").toUpperCase().includes("E");
                      const currentValue =
                        editingDayCell &&
                        editingDayCell.serialNumber === row.serialNumber &&
                        editingDayCell.dayIndex === selectedDayIndex
                          ? editingDayCell.text
                          : row.days[selectedDayIndex] === 0
                          ? ""
                          : String(row.days[selectedDayIndex]);

                      return (
                        <div
                          key={`daily-row-${row.serialNumber}`}
                          className={`flex items-center justify-between gap-2 rounded-xl border p-2 transition ${
                            isMorning
                              ? "border-amber-200/60 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20"
                              : isEvening
                              ? "border-violet-200/60 bg-violet-50/40 dark:border-violet-900/40 dark:bg-violet-950/20"
                              : "border-slate-200 bg-slate-50/50 dark:border-[#383838] dark:bg-white/5"
                          }`}
                        >
                          <div
                            className="flex min-w-0 flex-1 items-center gap-1.5 cursor-pointer select-none active:opacity-75 touch-manipulation"
                            onTouchStart={(e) => {
                              const touch = e.touches[0];
                              if (touch) {
                                startShiftLongPress(row, rowIndex, touch.clientX, touch.clientY);
                              }
                            }}
                            onTouchMove={(e) => {
                              const touch = e.touches[0];
                              if (touch) {
                                handleShiftTouchMove(touch.clientX, touch.clientY);
                              }
                            }}
                            onTouchEnd={cancelShiftLongPress}
                            onTouchCancel={cancelShiftLongPress}
                            onMouseDown={(e) => {
                              startShiftLongPress(row, rowIndex, e.clientX, e.clientY);
                            }}
                            onMouseMove={(e) => {
                              handleShiftTouchMove(e.clientX, e.clientY);
                            }}
                            onMouseUp={cancelShiftLongPress}
                            onMouseLeave={cancelShiftLongPress}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              cancelShiftLongPress();
                              setShiftToDelete({ row, rowIndex });
                            }}
                            title="Long press to delete this shift"
                          >
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold ${
                                isMorning
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-200"
                                  : isEvening
                                  ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/70 dark:text-indigo-200"
                                  : "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300"
                              }`}
                            >
                              {row.shift || "—"}
                            </span>
                            <span className="truncate text-xs font-semibold text-slate-700 dark:text-slate-300">
                              {isMorning ? "Morning" : isEvening ? "Evening" : row.shift || "Shift"}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <span className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400">₹</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              enterKeyHint="next"
                              ref={(el) => {
                                dailyInputRefs.current[`${row.serialNumber}-${selectedDayIndex}`] = el;
                              }}
                              placeholder="0"
                              value={currentValue}
                              onFocus={(event) => {
                                setFocusedCell({
                                  serialNumber: row.serialNumber,
                                  rowIndex,
                                  dayIndex: selectedDayIndex
                                });
                                setEditingDayCell({
                                  serialNumber: row.serialNumber,
                                  dayIndex: selectedDayIndex,
                                  text: row.days[selectedDayIndex] === 0 ? "" : String(row.days[selectedDayIndex])
                                });
                                scrollToInputOnMobile(event.currentTarget);
                              }}
                              onChange={(event) => {
                                setEditingDayCell({
                                  serialNumber: row.serialNumber,
                                  dayIndex: selectedDayIndex,
                                  text: event.target.value
                                });
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.currentTarget.blur();
                                  handleFocusNext();
                                }
                              }}
                              onBlur={(event) => {
                                updateDayValue(row.serialNumber, selectedDayIndex, event.target.value);
                                setEditingDayCell(null);
                              }}
                              className="h-10 w-20 rounded-lg border border-slate-300 bg-white px-2 text-center font-mono text-sm font-bold text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-[#555] dark:bg-[#202020] dark:text-white scroll-my-24"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Attached Total Footer on Last Customer Card */}
                  {isLastCustomer && (
                    <div className="mt-3.5 -mx-3.5 -mb-3.5 flex items-center justify-between rounded-b-2xl border-t border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-[#383838] dark:bg-white/5">
                      <div>
                        <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Day {selectedDayIndex + 1} Total
                        </span>
                        <span className="font-mono text-base font-extrabold text-brand-600 dark:text-brand-400">
                          ₹{rows.reduce((sum, r) => sum + (r.days[selectedDayIndex] ?? 0), 0)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Total
                        </span>
                        <span className="font-mono text-base font-extrabold text-slate-900 dark:text-white">
                          ₹{rows.reduce((grand, r) => grand + r.days.reduce((s, v) => s + v, 0), 0)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Table Matrix View (Always active on md: / tablet / desktop, togglable on mobile) */}
      <div className={`${mobileViewMode === "table" ? "flex flex-col gap-2" : "hidden"} md:flex md:flex-col md:flex-1 md:min-h-0 w-full`}>
        {/* Day Jumper Ribbon on Mobile */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-1 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] text-xs font-semibold md:hidden">
          <span className="text-[11px] text-slate-400 whitespace-nowrap">Jump:</span>
          <button type="button" onClick={() => jumpToDay(1)} className="shrink-0 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm active:scale-95 dark:border-[#444] dark:bg-white/5 dark:text-slate-200">Days 1–5</button>
          <button type="button" onClick={() => jumpToDay(6)} className="shrink-0 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm active:scale-95 dark:border-[#444] dark:bg-white/5 dark:text-slate-200">Days 6–10</button>
          <button type="button" onClick={() => jumpToDay(11)} className="shrink-0 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm active:scale-95 dark:border-[#444] dark:bg-white/5 dark:text-slate-200">Days 11–15</button>
          {dayCount > 15 && (
            <button type="button" onClick={() => jumpToDay(16)} className="shrink-0 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm active:scale-95 dark:border-[#444] dark:bg-white/5 dark:text-slate-200">Days 16–{dayCount}</button>
          )}
          <button type="button" onClick={() => jumpToDay(dayCount + 1)} className="shrink-0 px-2.5 py-1 rounded-lg bg-brand-500 text-white font-bold shadow-sm active:scale-95">Totals ➔</button>
        </div>

        <div
          ref={tableContainerRef}
          className="w-full min-h-0 min-w-0 max-w-full flex-1 overflow-auto rounded-md dark:bg-[#161616] [scrollbar-width:thin] [-webkit-overflow-scrolling:touch] max-h-[70dvh] md:max-h-none touch-pan-x touch-pan-y"
          style={{
            touchAction: "pan-x pan-y",
            WebkitOverflowScrolling: "touch",
            scrollbarGutter: "stable"
          }}
        >
        <table className="min-w-[1080px] table-fixed border-collapse border border-slate-400 text-center text-xs md:text-sm dark:bg-[#161616]">
          <colgroup>
            <col style={{ width: columnWidths.serial }} />
            <col style={{ width: columnWidths.customerName }} />
            <col style={{ width: columnWidths.shift }} />
            {columnWidths.days.map((width, index) => (
              <col key={`day-col-width-${index}`} style={{ width }} />
            ))}
            <col style={{ width: columnWidths.total }} />
          </colgroup>
          <thead className="bg-slate-100 font-semibold text-slate-800 dark:bg-[#262626] dark:text-slate-100">
            <tr>
              <th
                style={{ width: columnWidths.serial, position: "relative" }}
                className="sticky top-0 z-20 border border-slate-400 bg-slate-100 px-1 py-2 sm:px-1.5 dark:border-[#444] dark:bg-[#262626]"
              >
                S No
                <span
                  onPointerDown={(event) => startColumnResize("serial", columnWidths.serial, event)}
                  className="hidden md:block absolute inset-y-0 right-0 z-30 w-2 cursor-col-resize touch-none"
                  aria-hidden="true"
                />
              </th>
              <th
                style={{ width: columnWidths.customerName, position: "relative" }}
                className="sticky top-0 left-0 z-30 border border-slate-400 bg-slate-100 px-1 py-2 sm:px-1.5 dark:border-[#444] dark:bg-[#262626]"
              >
                Customer Name
                <span
                  onPointerDown={(event) => startColumnResize("customerName", columnWidths.customerName, event)}
                  className="hidden md:block absolute inset-y-0 right-0 z-40 w-2 cursor-col-resize touch-none"
                  aria-hidden="true"
                />
              </th>
              <th
                style={{ width: columnWidths.shift, position: "relative" }}
                className="sticky top-0 z-20 border border-slate-400 bg-slate-100 px-1 py-2 sm:px-1.5 dark:border-[#444] dark:bg-[#262626] dark:text-white"
              >
                Shift
                <span
                  onPointerDown={(event) => startColumnResize("shift", columnWidths.shift, event)}
                  className="hidden md:block absolute inset-y-0 right-0 z-30 w-2 cursor-col-resize touch-none"
                  aria-hidden="true"
                />
              </th>
              {Array.from({ length: dayCount }, (_, index) => {
                const isSelected = selectedDayIndices.includes(index);
                const isFocusedCol = focusedCell?.dayIndex === index;
                return (
                  <th
                    key={`day-${index + 1}`}
                    draggable
                    onDragStart={(event) => handleDayColumnDragStart(index, event)}
                    onDragOver={(event) => handleDayColumnDragOver(index, event)}
                    onDrop={(event) => handleDayColumnDrop(index, event)}
                    onDragEnd={clearDragState}
                    style={{ width: columnWidths.days[index] }}
                    className={`sticky top-0 z-50 border border-slate-400 px-1 py-2 sm:px-1.5 transition-colors ${
                      isSelected
                        ? "bg-blue-200 text-blue-950"
                        : isFocusedCol
                        ? "bg-brand-100 text-brand-950 ring-2 ring-inset ring-brand-500 font-extrabold dark:bg-brand-900/60 dark:text-brand-100 md:bg-slate-100 md:dark:bg-[#262626] md:text-slate-800 md:dark:text-slate-100 md:ring-0 md:font-semibold"
                        : "bg-slate-100 dark:bg-[#262626] dark:text-slate-100"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(event) => selectDayColumn(index, event)}
                      aria-label={`Select Day ${index + 1} column`}
                      className="flex min-h-10 w-full cursor-pointer select-none flex-col items-center justify-center rounded px-1 text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <span>Day {index + 1}</span>
                    </button>
                    <span
                      onPointerDown={(event) => startColumnResize(`day:${index}`, columnWidths.days[index], event)}
                      className="hidden md:block absolute inset-y-0 right-0 z-30 w-2 cursor-col-resize touch-none"
                      aria-hidden="true"
                    />
                  </th>
                );
              })}
              <th
                style={{ width: columnWidths.total, position: "relative" }}
                className="lg:sticky lg:top-0 z-20 border-l-2 border-r-2 border-t border-b border-slate-400 bg-slate-100 px-1 py-2 sm:px-1.5 dark:border-[#444] dark:bg-[#262626]"
              >
                Total
                <span
                  onPointerDown={(event) => startColumnResize("total", columnWidths.total, event)}
                  className="hidden md:block absolute inset-y-0 right-0 z-30 w-2 cursor-col-resize touch-none"
                  aria-hidden="true"
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const searchQuery = customerSearch.trim().toLowerCase();
              const visibleRowIndices = rows
                .map((_, rowIndex) => rowIndex)
                .filter((rowIndex) =>
                  searchQuery ? rows[rowIndex].customerName.toLowerCase().includes(searchQuery) : true
                );
              if (visibleRowIndices.length === 0) {
                return (
                  <tr>
                    <td colSpan={3 + dayCount + 1} className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                      No customers match “{customerSearch.trim()}”.
                    </td>
                  </tr>
                );
              }
              // Rebuild group spans within the filtered view so merged name/total
              // cells only span visible rows (a search can split a customer's
              // Morning/Evening rows apart).
              const visibleKeys = visibleRowIndices.map((rowIndex) =>
                rows[rowIndex].customerName.trim().toLowerCase()
              );
              const visibleGroupStart: number[] = visibleRowIndices.map((_, position) => position);
              for (let position = 1; position < visibleRowIndices.length; position++) {
                const key = visibleKeys[position];
                if (key && visibleKeys[position - 1] === key) {
                  visibleGroupStart[position] = visibleGroupStart[position - 1];
                }
              }
              const visibleGroupSizes = new Array(visibleRowIndices.length).fill(0);
              visibleGroupStart.forEach((start) => {
                visibleGroupSizes[start] += 1;
              });
              const visibleNameSpans = visibleGroupStart.map((start, position) =>
                start === position ? visibleGroupSizes[start] : 0
              );
              const displaySerialNumbers = buildDisplaySerialMap(rows);
              const groupStartIndices = buildGroupStartIndices(rows);
              return visibleRowIndices.map((rowIndex, position) => {
                const row = rows[rowIndex];
                const nameSpan = visibleNameSpans[position];
                // Combined M+E total across the customer's visible rows only.
                const groupPositions: number[] = [];
                const groupStartPosition = visibleGroupStart[position];
                for (let p = groupStartPosition; p < visibleRowIndices.length; p++) {
                  if (visibleGroupStart[p] !== groupStartPosition) break;
                  groupPositions.push(p);
                }
                const displayTotal = groupPositions.reduce(
                  (sum, p) =>
                    sum + rows[visibleRowIndices[p]].days.reduce((rowSum, value) => rowSum + value, 0),
                  0
                );
              const total = row.days.reduce((sum, value) => sum + value, 0);

              const isRowSelected = selectedRowIndices.includes(rowIndex);
              const isRowFocused = focusedCell?.rowIndex === rowIndex;
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
                  className={
                    isRowSelected
                      ? "bg-blue-50 dark:bg-blue-950/40"
                      : isRowFocused
                      ? "bg-brand-50/60 dark:bg-brand-950/40 md:bg-white md:dark:bg-[#1c1c1c]"
                      : "bg-white dark:bg-[#1c1c1c]"
                  }
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
                        className="hidden md:block absolute bottom-0 left-0 z-[70] h-3 w-full cursor-row-resize touch-none rounded-sm bg-transparent hover:bg-slate-300/40"
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
                        onFocus={(event) => scrollToInputOnMobile(event.currentTarget)}
                        placeholder={activeHistoryId ? "-" : undefined}
                        className={`h-11 min-h-[44px] w-full min-w-0 rounded-lg border border-slate-300 px-2 py-2 text-left text-[14px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-[#444] dark:bg-[#1c1c1c] dark:text-white scroll-my-24 ${isRowSelected ? "bg-blue-50 dark:bg-blue-950/40" : "bg-white dark:bg-[#1c1c1c]"}`}
                      />
                    </td>
                  )}
                  <td
                    onDoubleClick={(event) => selectSingleShiftRow(rowIndex, event)}
                    style={{ height: rowHeights[rowIndex] ?? DEFAULT_ROW_HEIGHT, position: "relative", verticalAlign: "middle" }}
                    className={`border border-slate-300 px-1 py-1 md:px-2 dark:border-[#444] ${isRowSelected ? "bg-blue-100 dark:bg-blue-900/50" : "bg-white dark:bg-[#1c1c1c]"}`}
                    title="Double-click this Shift cell to select only this shift row for deletion. Single click edits normally."
                  >
                    <input
                      value={row.shift}
                      onChange={(event) => updateShift(row.serialNumber, event.target.value)}
                      onFocus={(event) => scrollToInputOnMobile(event.currentTarget)}
                      placeholder={activeHistoryId ? "-" : undefined}
                      className={`h-11 min-h-[44px] w-full rounded-lg border border-slate-300 px-2 py-2 text-center text-[14px] font-semibold focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-[#444] dark:bg-[#1c1c1c] dark:text-white scroll-my-24 ${isRowSelected ? "bg-blue-50 dark:bg-blue-950/40" : "bg-white dark:bg-[#1c1c1c]"}`}
                    />
                    </td>
                  {row.days.map((value, dayIndex) => {
                    const isCellFocused =
                      focusedCell?.serialNumber === row.serialNumber &&
                      focusedCell?.dayIndex === dayIndex;
                    const isColFocused = focusedCell?.dayIndex === dayIndex;

                    return (
                      <td
                        key={`${row.serialNumber}-${dayIndex + 1}`}
                        style={{ height: rowHeights[rowIndex] ?? DEFAULT_ROW_HEIGHT, verticalAlign: "middle" }}
                        className={`border border-slate-300 px-1 py-1 transition-colors ${
                          selectedDayIndices.includes(dayIndex)
                            ? "bg-blue-50"
                            : isRowSelected
                            ? "bg-blue-100"
                            : isCellFocused
                            ? "bg-brand-100/80 dark:bg-brand-900/50 md:bg-white md:dark:bg-[#1c1c1c]"
                            : isColFocused
                            ? "bg-brand-50/30 dark:bg-brand-950/20 md:bg-white md:dark:bg-[#1c1c1c]"
                            : "bg-white dark:bg-[#1c1c1c]"
                        }`}
                      >
                        <input
                          ref={(el) => {
                            tableInputRefs.current[`${row.serialNumber}-${dayIndex}`] = el;
                          }}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          enterKeyHint="next"
                          placeholder={activeHistoryId ? "-" : undefined}
                          aria-label={`${row.customerName || "Customer"} Day ${dayIndex + 1}`}
                          value={
                            editingDayCell &&
                            editingDayCell.serialNumber === row.serialNumber &&
                            editingDayCell.dayIndex === dayIndex
                              ? editingDayCell.text
                              : value === 0
                              ? ""
                              : String(value)
                          }
                          onFocus={(event) => {
                            setFocusedCell({
                              serialNumber: row.serialNumber,
                              rowIndex,
                              dayIndex
                            });
                            setEditingDayCell({
                              serialNumber: row.serialNumber,
                              dayIndex,
                              text: value === 0 ? "" : String(value)
                            });
                            scrollToInputOnMobile(event.currentTarget);
                          }}
                          onChange={(event) =>
                            setEditingDayCell({
                              serialNumber: row.serialNumber,
                              dayIndex,
                              text: event.target.value
                            })
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.currentTarget.blur();
                              handleFocusNext();
                            }
                          }}
                          onBlur={(event) => {
                            updateDayValue(row.serialNumber, dayIndex, event.target.value);
                            setEditingDayCell(null);
                          }}
                          className={`h-11 min-h-[44px] w-full rounded-lg border px-1 py-2 text-center font-mono tabular-nums text-[15px] font-semibold focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:text-white scroll-my-24 ${
                            isCellFocused
                              ? "border-brand-500 ring-2 ring-brand-500/30 bg-white dark:bg-[#222]"
                              : selectedDayIndices.includes(dayIndex)
                              ? "border-blue-300 bg-blue-100 dark:border-blue-700 dark:bg-blue-900/50"
                              : isRowSelected
                              ? "border-blue-200 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40"
                              : row.shift === "M"
                              ? "border-amber-200 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/30"
                              : row.shift === "E"
                              ? "border-violet-200 bg-violet-50/60 dark:border-violet-700 dark:bg-violet-950/30"
                              : "border-slate-300 bg-white dark:border-[#444] dark:bg-[#1c1c1c]"
                          }`}
                        />
                      </td>
                    );
                  })}
                  {nameSpan > 0 && (
                    <td
                      rowSpan={nameSpan}
                      style={{ height: rowHeights[rowIndex] ?? DEFAULT_ROW_HEIGHT, verticalAlign: "middle" }}
                      className={`border-l-2 border-r-2 border-y border-slate-300 px-1 py-1 font-mono tabular-nums font-semibold md:px-2 ${
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
          <tfoot className="bg-slate-100 dark:bg-[#262626]">
            <tr className="bg-slate-100 text-[11px] font-bold leading-tight text-slate-900 dark:bg-[#262626] dark:text-white md:text-xs">
              <td
                colSpan={3}
                className="sticky bottom-0 z-20 border-l-2 border-y border-slate-400 bg-slate-100 px-1 py-1 text-center shadow-[0_-2px_6px_rgba(0,0,0,0.12)] sm:px-1.5 dark:border-[#444] dark:bg-[#262626] dark:text-white"
              >
                Total
              </td>
              {Array.from({ length: dayCount }, (_, dayIndex) => {
                const dayTotal = rows.reduce(
                  (sum, row) => sum + (row.days[dayIndex] ?? 0),
                  0
                );

                return (
                  <td
                    key={`daily-total-${dayIndex}`}
                    className="sticky bottom-0 z-20 border-l-2 border-r-2 border-y border-slate-400 bg-slate-100 px-1 py-1 text-center font-mono tabular-nums shadow-[0_-2px_6px_rgba(0,0,0,0.12)] sm:px-1.5 dark:border-[#444] dark:bg-[#262626] dark:text-white"
                  >
                    {dayTotal}
                  </td>
                );
              })}
              <td
                className="sticky bottom-0 z-20 border border-slate-400 bg-slate-100 px-1 py-1 text-center font-mono tabular-nums shadow-[0_-2px_6px_rgba(0,0,0,0.12)] sm:px-1.5 dark:border-[#444] dark:bg-[#262626] dark:text-white"
              >
                {rows.reduce(
                  (grandTotal, row) =>
                    grandTotal + row.days.reduce((sum, value) => sum + value, 0),
                  0
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      </div>
    </div>
  );
}

export default CustomerTable;
