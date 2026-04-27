import { useState } from "react";

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

  const saveState = (nextState: SheetState) => {
    setSheetState(nextState);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(SHEET_STORAGE_KEY, JSON.stringify(nextState));
    }
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

  return (
    <div className="space-y-3 rounded-xl border border-slate-300 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addRow}
          className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Add Row
        </button>
        <button
          type="button"
          onClick={removeRow}
          disabled={rows.length <= 1}
          className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Remove Row
        </button>
        <button
          type="button"
          onClick={archiveToHistory}
          className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
        >
          Save to History
        </button>
      </div>

      <div className="overflow-auto">
        <table className="min-w-[1500px] border-collapse text-center text-sm">
          <thead className="bg-slate-100 font-semibold text-slate-800">
            <tr>
              <th className="min-w-16 border border-slate-400 px-2 py-2">S No</th>
              <th className="min-w-36 border border-slate-400 px-2 py-2">Customer Name</th>
              {Array.from({ length: dayCount }, (_, index) => (
                <th key={`day-${index + 1}`} className="min-w-20 border border-slate-400 px-2 py-2">
                  Day {index + 1}
                </th>
              ))}
              <th className="min-w-20 border border-slate-400 px-2 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const total = row.days.reduce((sum, value) => sum + value, 0);

              return (
                <tr key={row.serialNumber} className="bg-white even:bg-slate-50">
                  <td className="border border-slate-300 px-2 py-1">{row.serialNumber}</td>
                  <td className="border border-slate-300 px-2 py-1">
                    <input
                      value={row.customerName}
                      onChange={(event) => updateCustomerName(row.serialNumber, event.target.value)}
                      className="w-full rounded border border-slate-300 px-2 py-1 text-left"
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
                        className="w-full rounded border border-slate-300 px-2 py-1 text-center"
                      />
                    </td>
                  ))}
                  <td className="border border-slate-300 px-2 py-1 font-semibold">{total}</td>
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