import { useEffect, useState } from "react";
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
    const priorityDifference = getGroupShiftPriority(a) - getGroupShiftPriority(b);
    if (priorityDifference !== 0) return priorityDifference;
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

function CustomerTable() {
  const [sheetState, setSheetState] = useState<SheetState>(createInitialState());
  const [showSaveNameModal, setShowSaveNameModal] = useState(false);
  const [sheetNameInput, setSheetNameInput] = useState("");
  // Holds the raw text (e.g. "2+3+5") while a day cell is being typed into, so
  // the "+" characters aren't stripped before the user finishes the expression.
  const [editingDayCell, setEditingDayCell] = useState<{
    serialNumber: number;
    dayIndex: number;
    text: string;
  } | null>(null);

  const { rows, dayCount } = sheetState;

  // Sync customer names from master customer data. Rows always mirror the customer list
  // 1:1: adding a customer automatically adds a matching row, and removing a customer
  // automatically drops its row, so there are never extra unused rows sitting in the sheet.
  const syncCustomersToSheet = () => {
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
          const activeUser = getActiveUser();
          if (activeUser?.email) {
            void saveSheetByEmail(activeUser.email, { dayCount: prevDayCount, rows: fallbackRows });
          }
          return { dayCount: prevDayCount, rows: fallbackRows };
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
          const activeUser = getActiveUser();
          if (activeUser?.email) {
            void saveSheetByEmail(activeUser.email, { dayCount: prevDayCount, rows: nextRows });
          }
          notifyMilkDataChanged();
          return { dayCount: prevDayCount, rows: nextRows };
        }

        return prev;
      });
    })();
  };

  useEffect(() => {
    let isMounted = true;
    let unsubscribeCustomers: (() => void) | undefined;
    let unsubscribeSheet: (() => void) | undefined;

    const init = async () => {
      const activeUser = getActiveUser();
      if (!activeUser?.email) {
        if (isMounted) setSheetState(createInitialState());
        return;
      }

      // Load the real saved sheet FIRST and wait for it to land in state before doing
      // anything else. Previously the customer-sync effect ran in parallel with this
      // fetch and could win the race, computing its "next rows" from the still-empty
      // initial state and saving that empty sheet back over the real saved data —
      // which is what caused all entries to disappear after a refresh.
      const sheet = await getSheetByEmail(activeUser.email);
      if (!isMounted) return;
      setSheetState({
        dayCount: sheet.dayCount,
        rows: normalizeRows(sheet.rows, sheet.dayCount)
      });

      // Only now, with real data in state, is it safe to sync customer names in and
      // start listening for customer/sheet changes.
      syncCustomersToSheet();
      unsubscribeCustomers = subscribeCustomersChanged(syncCustomersToSheet);

      unsubscribeSheet = subscribeSheetByEmail(activeUser.email, (nextSheet) => {
        setSheetState({
          dayCount: nextSheet.dayCount,
          rows: normalizeRows(nextSheet.rows, nextSheet.dayCount)
        });
      });
    };

    void init();

    return () => {
      isMounted = false;
      unsubscribeCustomers?.();
      unsubscribeSheet?.();
    };
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

  const archiveToHistory = (name: string) => {
    const activeUser = getActiveUser();
    if (!activeUser?.email) {
      return;
    }

    void archiveSheetByEmail(activeUser.email, { dayCount, rows }, name).then((nextSheet) => {
      setSheetState(nextSheet);
      notifyMilkDataChanged();
    });
  };

  const openSaveNameModal = () => {
    setSheetNameInput("");
    setShowSaveNameModal(true);
  };

  const confirmSaveToHistory = () => {
    archiveToHistory(sheetNameInput);
    setShowSaveNameModal(false);
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
    <div className="space-y-3 bg-white p-2 md:p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
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
        </div>
        <button
          type="button"
          onClick={openSaveNameModal}
          className="w-full min-h-[44px] rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 sm:ml-auto sm:w-auto sm:text-sm"
        >
          Save to History
        </button>
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
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSaveToHistory}
                className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}


      <div>
        <table className="min-w-[1080px] table-fixed border-collapse text-center text-xs md:text-sm">
          <thead className="bg-slate-100 font-semibold text-slate-800">
            <tr>
              <th className="sticky top-0 z-20 w-24 border border-slate-400 bg-slate-100 px-1 py-2 md:w-28 md:px-2">S No</th>
              <th className="sticky top-0 left-0 z-30 w-24 border border-slate-400 bg-slate-100 px-1 py-2 md:w-28 md:px-2">Customer Name</th>
              <th className="sticky top-0 z-20 w-24 border border-slate-400 bg-slate-100 px-1 py-2 md:w-28 md:px-2">Shift</th>
              {Array.from({ length: dayCount }, (_, index) => (
                <th key={`day-${index + 1}`} className="sticky top-0 z-20 w-24 border border-slate-400 bg-slate-100 px-1 py-2 md:w-28 md:px-2">
                  Day {index + 1}
                </th>
              ))}
              <th className="sticky top-0 z-20 w-24 border border-slate-400 bg-slate-100 px-1 py-2 md:w-28 md:px-2">Total</th>
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

              return (
                <tr key={row.serialNumber} className="bg-white">
                  {nameSpan > 0 && (
                    <td rowSpan={nameSpan} className="border border-slate-300 px-1 py-1 md:px-2 font-semibold align-middle" style={{ verticalAlign: "middle" }}>{displaySerialNumbers[rowIndex]}</td>
                  )}
                  {nameSpan > 0 && (
                    <td rowSpan={nameSpan} className="sticky left-0 z-10 border border-slate-300 bg-white px-1 py-1 md:px-2 align-middle" style={{ verticalAlign: "middle" }}>
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
                    />
                  </td>
                  {row.days.map((value, dayIndex) => (
                    <td
                      key={`${row.serialNumber}-${dayIndex + 1}`}
                      className="border border-slate-300 px-1 py-1"
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
