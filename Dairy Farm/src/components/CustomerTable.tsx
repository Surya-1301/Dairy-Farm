import { useEffect, useState } from "react";
import { getCustomers, subscribeCustomersChanged } from "../utils/customerData";
import { notifyMilkDataChanged } from "../utils/milkData";
import { send15DaysDataToWhatsApp } from "../utils/whatsapp";

const INITIAL_ROWS = 20;
const INITIAL_DAYS = 15;
const SHEET_STORAGE_KEY = "dairy-farm-customer-sheet";
const SHEET_HISTORY_KEY = "dairy-farm-customer-sheet-history";

type SheetRow = {
  serialNumber: number;
  customerName: string;
  days: number[];
};

type SheetState = {
  dayCount: number;
  rows: SheetRow[];
};

type SheetHistoryEntry = SheetState & {
  id: string;
  savedAt: string;
};

function createEmptyRow(serialNumber: number, dayCount: number): SheetRow {
  return {
    serialNumber,
    customerName: "",
    days: Array.from({ length: dayCount }, () => 0)
  };
}

function createInitialState(): SheetState {
  return {
    dayCount: INITIAL_DAYS,
    rows: Array.from({ length: INITIAL_ROWS }, (_, index) =>
      createEmptyRow(index + 1, INITIAL_DAYS)
    )
  };
}

function normalizeRows(rows: SheetRow[], dayCount: number): SheetRow[] {
  return rows.map((row, index) => ({
    serialNumber: index + 1,
    customerName: row.customerName ?? "",
    days: Array.from({ length: dayCount }, (_, dayIndex) => row.days?.[dayIndex] ?? 0)
  }));
}

function getInitialState(): SheetState {
  if (typeof window === "undefined") {
    return createInitialState();
  }

  const savedValue = window.localStorage.getItem(SHEET_STORAGE_KEY);

  if (!savedValue) {
    return createInitialState();
  }

  try {
    const parsedValue = JSON.parse(savedValue) as SheetState | SheetRow[];

    if (Array.isArray(parsedValue)) {
      return {
        dayCount: INITIAL_DAYS,
        rows: normalizeRows(parsedValue, INITIAL_DAYS)
      };
    }

    if (
      parsedValue &&
      typeof parsedValue === "object" &&
      Array.isArray(parsedValue.rows) &&
      typeof parsedValue.dayCount === "number"
    ) {
      return {
        dayCount: parsedValue.dayCount,
        rows: normalizeRows(parsedValue.rows, parsedValue.dayCount)
      };
    }
  } catch {
    return createInitialState();
  }

  return createInitialState();
}

function getSheetHistory(): SheetHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  const savedValue = window.localStorage.getItem(SHEET_HISTORY_KEY);

  if (!savedValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(savedValue) as SheetHistoryEntry[];
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

function CustomerTable() {
  const [sheetState, setSheetState] = useState<SheetState>(() => getInitialState());

  const { rows, dayCount } = sheetState;

  // Sync customer names from master customer data — run on mount and when customers change
  useEffect(() => {
    const syncCustomersToSheet = () => {
      const customers = getCustomers();

      setSheetState((prev) => {
        const { dayCount: prevDayCount, rows: prevRows } = prev;
        const updatedRows = prevRows.map((row) => {
          const customer = customers.find((c) => c.serialNumber === row.serialNumber);
          if (customer && customer.name) {
            return { ...row, customerName: customer.name };
          }
          return row;
        });

        const changed = updatedRows.some((r, i) => r.customerName !== prevRows[i].customerName);

        if (changed) {
          if (typeof window !== "undefined") {
            window.localStorage.setItem(SHEET_STORAGE_KEY, JSON.stringify({ dayCount: prevDayCount, rows: updatedRows }));
          }
          notifyMilkDataChanged();
          return { dayCount: prevDayCount, rows: updatedRows };
        }

        return prev;
      });
    };

    // initial sync
    syncCustomersToSheet();

    const unsubscribe = subscribeCustomersChanged(syncCustomersToSheet);
    return unsubscribe;
  }, []);

  const saveState = (nextState: SheetState) => {
    setSheetState(nextState);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(SHEET_STORAGE_KEY, JSON.stringify(nextState));
    }

    notifyMilkDataChanged();
  };

  const archiveToHistory = () => {
    const historyEntry: SheetHistoryEntry = {
      id: `history-${Date.now()}`,
      savedAt: new Date().toISOString(),
      dayCount,
      rows
    };

    const nextHistory = [historyEntry, ...getSheetHistory()];

    if (typeof window !== "undefined") {
      window.localStorage.setItem(SHEET_HISTORY_KEY, JSON.stringify(nextHistory));
    }

    saveState(createInitialState());
  };

  const updateCustomerName = (serialNumber: number, customerName: string) => {
    const nextRows = rows.map((row) =>
      row.serialNumber === serialNumber ? { ...row, customerName } : row
    );

    saveState({ dayCount, rows: nextRows });
  };

  const updateDayValue = (serialNumber: number, dayIndex: number, value: string) => {
    const parsedValue = Number(value);
    const safeValue = Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 0;

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
  };

  const addColumn = () => {
    const nextRows = rows.map((row) => ({
      ...row,
      days: [...row.days, 0]
    }));

    saveState({ dayCount: dayCount + 1, rows: nextRows });
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
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-300 bg-white p-3 shadow-sm md:p-4">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <button
          type="button"
          onClick={addRow}
          className="min-h-[44px] rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 sm:text-sm"
        >
          Add Row
        </button>
        <button
          type="button"
          onClick={removeRow}
          disabled={rows.length <= 1}
          className="min-h-[44px] rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
        >
          Remove Row
        </button>
        <button
          type="button"
          onClick={addColumn}
          className="min-h-[44px] rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 sm:text-sm"
        >
          Add Column
        </button>
        <button
          type="button"
          onClick={removeColumn}
          disabled={dayCount <= 1}
          className="min-h-[44px] rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
        >
          Remove Column
        </button>
        <button
          type="button"
          onClick={archiveToHistory}
          className="col-span-2 min-h-[44px] rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 sm:col-auto sm:text-sm"
        >
          Save to History
        </button>
      </div>

      <p className="text-xs text-slate-500 sm:hidden">Swipe left/right to view all day columns.</p>

      <div className="overflow-auto">
        <table className="min-w-[980px] border-collapse text-center text-xs md:text-sm">
          <thead className="bg-slate-100 font-semibold text-slate-800">
            <tr>
              <th className="min-w-14 border border-slate-400 px-1 py-2 md:px-2">S No</th>
              <th className="min-w-28 border border-slate-400 px-1 py-2 md:min-w-36 md:px-2">Customer Name</th>
              {Array.from({ length: dayCount }, (_, index) => (
                <th key={`day-${index + 1}`} className="min-w-16 border border-slate-400 px-1 py-2 md:min-w-20 md:px-2">
                  Day {index + 1}
                </th>
              ))}
              <th className="min-w-16 border border-slate-400 px-1 py-2 md:min-w-20 md:px-2">Total</th>
              <th className="min-w-24 border border-slate-400 px-1 py-2 md:min-w-28 md:px-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const total = row.days.reduce((sum, value) => sum + value, 0);

              return (
                <tr key={row.serialNumber} className="bg-white even:bg-slate-50">
                  <td className="border border-slate-300 px-1 py-1 md:px-2">{row.serialNumber}</td>
                  <td className="border border-slate-300 px-1 py-1 md:px-2">
                    <input
                      value={row.customerName}
                      onChange={(event) => updateCustomerName(row.serialNumber, event.target.value)}
                      className="h-9 w-full rounded border border-slate-300 px-2 py-1 text-left"
                    />
                  </td>
                  {row.days.map((value, dayIndex) => (
                    <td
                      key={`${row.serialNumber}-${dayIndex + 1}`}
                      className="border border-slate-300 px-1 py-1"
                    >
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={value === 0 ? "" : value}
                        onChange={(event) =>
                          updateDayValue(row.serialNumber, dayIndex, event.target.value)
                        }
                        className="h-9 w-full rounded border border-slate-300 px-2 py-1 text-center"
                      />
                    </td>
                  ))}
                  <td className="border border-slate-300 px-1 py-1 font-semibold md:px-2">{total}</td>
                  <td className="border border-slate-300 px-1 py-1 md:px-2">
                    <button
                      type="button"
                      onClick={() => send15DaysDataToWhatsApp(row.serialNumber)}
                      className="min-h-[36px] rounded-lg bg-green-500 px-2 py-1 text-xs font-semibold text-white hover:bg-green-600 transition-colors"
                      title="Send 15 days data to WhatsApp"
                    >
                      📱 Send
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CustomerTable;
