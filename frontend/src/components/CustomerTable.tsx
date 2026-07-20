import { useEffect, useRef, useState } from "react";
import { getCustomers, subscribeCustomersChanged } from "../utils/customerData";
import { notifyMilkDataChanged } from "../utils/milkData";

import { getActiveUser } from "../firebase/auth";
import {
  archiveSheetByEmail,
  createInitialSheet,
  getSheetByEmail,
  saveSheetByEmail,
  subscribeSheetByEmail,
  type SheetState,
  type SheetRow
} from "../firebase/data";

const INITIAL_DAYS = 16;

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

function getShiftPriority(shift: string): number {
  const normalizedShift = shift.trim().toUpperCase();
  if (normalizedShift === "M" || normalizedShift.includes("MORNING")) return 1;
  if (normalizedShift === "E" || normalizedShift.includes("EVENING")) return 2;
  return 3;
}

function sortRowsForDisplay(rows: SheetRow[]): SheetRow[] {
  const groups: SheetRow[][] = [];
  const used = new Set<number>();

  rows.forEach((row, index) => {
    if (used.has(index)) return;

    const customerKey = row.customerName.trim().toLowerCase();
    const group = customerKey
      ? rows
          .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
          .filter(({ candidate, candidateIndex }) => {
            return !used.has(candidateIndex) && candidate.customerName.trim().toLowerCase() === customerKey;
          })
      : [{ candidate: row, candidateIndex: index }];

    group.forEach(({ candidateIndex }) => used.add(candidateIndex));
    groups.push(group.map(({ candidate }) => candidate));
  });

  return groups
    .sort((a, b) => {
      const aHasMorning = a.some((row) => getShiftPriority(row.shift) === 1);
      const aHasEvening = a.some((row) => getShiftPriority(row.shift) === 2);
      const bHasMorning = b.some((row) => getShiftPriority(row.shift) === 1);
      const bHasEvening = b.some((row) => getShiftPriority(row.shift) === 2);
      const aPriority = aHasMorning && aHasEvening ? 0 : aHasMorning ? 1 : aHasEvening ? 2 : 3;
      const bPriority = bHasMorning && bHasEvening ? 0 : bHasMorning ? 1 : bHasEvening ? 2 : 3;

      if (aPriority !== bPriority) return aPriority - bPriority;
      return a[0].serialNumber - b[0].serialNumber;
    })
    .flatMap((group) => [...group].sort((a, b) => getShiftPriority(a.shift) - getShiftPriority(b.shift)));
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

function createFilledHistorySheet(rows: SheetRow[], dayCount: number): SheetState {
  const displayRows = sortRowsForDisplay(rows);
  const enteredRows = displayRows.filter((row) => row.customerName.trim() || row.shift.trim());

  const lastFilledDayIndex = enteredRows.reduce((lastIndex, row) => {
    const rowLastFilledDayIndex = row.days.reduce(
      (rowLastIndex, value, dayIndex) => (Number(value) > 0 ? dayIndex : rowLastIndex),
      -1
    );
    return Math.max(lastIndex, rowLastFilledDayIndex);
  }, -1);

  if (enteredRows.length === 0) {
    return { dayCount: 0, rows: [] };
  }

  const daysToSave = lastFilledDayIndex >= 0 ? lastFilledDayIndex + 1 : 1;

  return {
    dayCount: daysToSave,
    rows: enteredRows.map((row, index) => ({
      ...row,
      serialNumber: index + 1,
      days: Array.from({ length: daysToSave }, (_, dayIndex) => row.days[dayIndex] ?? 0)
    }))
  };
}

function CustomerTable() {
  const [sheetState, setSheetState] = useState<SheetState>(createInitialState());
  const [showActionBar, setShowActionBar] = useState(true);
  const lastScrollTopRef = useRef(0);

  const { rows, dayCount } = sheetState;
  const displayRows = sortRowsForDisplay(rows);

  useEffect(() => {
    const activeUser = getActiveUser();
    if (!activeUser?.email) {
      setSheetState(createInitialState());
      return;
    }

    void getSheetByEmail(activeUser.email).then((sheet) => {
      setSheetState({
        dayCount: sheet.dayCount,
        rows: normalizeRows(sheet.rows, sheet.dayCount)
      });
    });

    return subscribeSheetByEmail(activeUser.email, (sheet) => {
      setSheetState({
        dayCount: sheet.dayCount,
        rows: normalizeRows(sheet.rows, sheet.dayCount)
      });
    });
  }, []);

  // Sync customer names from master customer data — run on mount and when customers change
  useEffect(() => {
    const syncCustomersToSheet = () => {
      void (async () => {
        const customers = await getCustomers();

        setSheetState((prev) => {
          const { dayCount: prevDayCount, rows: prevRows } = prev;
          const requiredRowCount = Math.max(prevRows.length, customers.length);

const updatedRows = Array.from({ length: requiredRowCount }, (_, index) => {
  const serialNumber = index + 1;
  const existingRow = prevRows[index] ?? createEmptyRow(serialNumber, prevDayCount);
  const customer = customers.find((c) => c.serialNumber === serialNumber);

  if (customer && customer.name) {
    return {
      ...existingRow,
      serialNumber,
      customerName: customer.name,
      shift: customer.shift || existingRow.shift,
      days: Array.from(
        { length: prevDayCount },
        (_, dayIndex) => existingRow.days?.[dayIndex] ?? 0
      )
    };
  }

  return {
    ...existingRow,
    serialNumber,
    days: Array.from(
      { length: prevDayCount },
      (_, dayIndex) => existingRow.days?.[dayIndex] ?? 0
    )
  };
});

          const changed =
  updatedRows.length !== prevRows.length ||
  updatedRows.some((row, index) => {
    const previousRow = prevRows[index];
    return (
      !previousRow ||
      row.customerName !== previousRow.customerName ||
      row.shift !== previousRow.shift ||
      row.days.length !== previousRow.days.length
    );
  });

          if (changed) {
            const activeUser = getActiveUser();
            if (activeUser?.email) {
              void saveSheetByEmail(activeUser.email, { dayCount: prevDayCount, rows: updatedRows });
            }
            notifyMilkDataChanged();
            return { dayCount: prevDayCount, rows: updatedRows };
          }

          return prev;
        });
      })();
    };

    // initial sync
    syncCustomersToSheet();

    const unsubscribe = subscribeCustomersChanged(syncCustomersToSheet);
    return unsubscribe;
  }, []);

  const saveState = (nextState: SheetState) => {
    const normalizedRows = nextState.rows.map((row, index) => ({
      ...row,
      serialNumber: index + 1
    }));
    const normalizedState = { ...nextState, rows: normalizedRows };

    setSheetState(normalizedState);
    const activeUser = getActiveUser();
    if (activeUser?.email) {
      void saveSheetByEmail(activeUser.email, normalizedState);
    }

    notifyMilkDataChanged();
  };

  const archiveToHistory = () => {
    const activeUser = getActiveUser();
    if (!activeUser?.email) {
      return;
    }

    const filledHistorySheet = createFilledHistorySheet(rows, dayCount);

    if (filledHistorySheet.rows.length === 0) {
      alert("No entered rows found to save in history.");
      return;
    }

    const sheetName = window.prompt("Enter history sheet name:", `Sheet ${new Date().toLocaleDateString()}`);

    if (sheetName === null) {
      return;
    }

    void archiveSheetByEmail(activeUser.email, filledHistorySheet, sheetName).then((nextSheet) => {
      setSheetState(nextSheet);
      notifyMilkDataChanged();
    });
  };

  const updateCustomerName = (serialNumber: number, customerName: string) => {
    const targetRow = rows.find((row) => row.serialNumber === serialNumber);
    const oldKey = targetRow?.customerName.trim().toLowerCase() ?? "";

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
    const nextRows = rows.map((row) =>
      row.serialNumber === serialNumber ? { ...row, shift } : row
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

  const handleSheetScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const nextScrollTop = event.currentTarget.scrollTop;
    const previousScrollTop = lastScrollTopRef.current;

    if (nextScrollTop < previousScrollTop || nextScrollTop <= 8) {
      setShowActionBar(true);
    } else if (nextScrollTop > previousScrollTop + 8) {
      setShowActionBar(false);
    }

    lastScrollTopRef.current = nextScrollTop;
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col rounded-xl border border-slate-300 bg-white p-3 shadow-sm md:p-4">
      <div
        className={`absolute left-3 right-3 top-3 z-20 grid grid-cols-2 gap-2 rounded-lg bg-white/95 transition-all duration-200 sm:flex sm:flex-wrap sm:items-center ${
          showActionBar
            ? "translate-y-0 opacity-100 shadow-sm"
            : "pointer-events-none -translate-y-full opacity-0"
        }`}
      >
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
          className="col-span-2 ml-auto min-h-[44px] rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 sm:col-auto sm:text-sm"
        >
          Save to History
        </button>
      </div>

      

     <div className={`min-h-0 flex-1 overflow-auto pb-2 ${showActionBar ? "pt-16 sm:pt-14" : "pt-0"}`} onScroll={handleSheetScroll}>
        <table className="min-w-[1080px] border-collapse text-center text-xs md:text-sm">
          <thead className="bg-slate-100 font-semibold text-slate-800">
            <tr>
              <th className="min-w-14 border border-slate-400 px-1 py-2 md:px-2">S No</th>
              <th className="min-w-28 border border-slate-400 px-1 py-2 md:min-w-36 md:px-2">Customer Name</th>
              <th className="min-w-20 border border-slate-400 px-1 py-2 md:min-w-24 md:px-2">Shift</th>
              {Array.from({ length: dayCount }, (_, index) => (
                <th key={`day-${index + 1}`} className="min-w-16 border border-slate-400 px-1 py-2 md:min-w-20 md:px-2">
                  Day {index + 1}
                </th>
              ))}
              <th className="min-w-16 border border-slate-400 px-1 py-2 md:min-w-20 md:px-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const displaySerialNumbers = buildDisplaySerialMap(displayRows);
              const groupStartIndices = buildGroupStartIndices(displayRows);
              const nameCellSpans = buildNameCellSpans(groupStartIndices);
              const combinedTotals = buildCombinedTotals(displayRows, groupStartIndices);
              return displayRows.map((row, rowIndex) => {
              const total = row.days.reduce((sum, value) => sum + value, 0);
              const nameSpan = nameCellSpans[rowIndex];
              const displayTotal = nameSpan > 1 ? combinedTotals[rowIndex] : total;

              return (
                <tr key={row.serialNumber} className="bg-white even:bg-slate-50">
                  <td className="border border-slate-300 px-1 py-1 md:px-2 font-semibold">{displaySerialNumbers[rowIndex]}</td>
                  {nameSpan > 0 && (
                    <td rowSpan={nameSpan} className="border border-slate-300 px-1 py-1 md:px-2">
                      <input
                        value={row.customerName}
                        onChange={(event) => updateCustomerName(row.serialNumber, event.target.value)}
                        className="h-9 w-full rounded border border-slate-300 bg-white px-2 py-1 text-left"
                      />
                    </td>
                  )}
                  <td className="border border-slate-300 px-1 py-1 md:px-2">
                    <input
                      value={row.shift}
                      onChange={(event) => updateShift(row.serialNumber, event.target.value)}
                      className="h-9 w-full rounded border border-slate-300 bg-white px-2 py-1 text-center"
                      placeholder="M/E"
                    />
                  </td>
                  {row.days.map((value, dayIndex) => (
                    <td
                      key={`${row.serialNumber}-${dayIndex + 1}`}
                      className="border border-slate-300 px-1 py-1"
                    >
                      <input
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.]?[0-9]*"
                        value={value === 0 ? "" : value}
                        onKeyDown={(event) => {
                          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                            event.preventDefault();
                          }
                        }}
                        onWheel={(event) => event.currentTarget.blur()}
                        onChange={(event) => {
                          const nextValue = event.target.value.replace(/[^0-9.]/g, "");
                          updateDayValue(row.serialNumber, dayIndex, nextValue);
                        }}
                        className="h-9 w-full rounded border border-slate-300 bg-white px-2 py-1 text-center"
                      />
                    </td>
                  ))}
                  {nameSpan > 0 && (
                    <td rowSpan={nameSpan} className="border border-slate-300 px-1 py-1 font-semibold md:px-2">
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
