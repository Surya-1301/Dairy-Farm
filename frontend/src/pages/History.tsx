import { useEffect, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getActiveUser } from "../firebase/auth";
import { getHistoryByEmail, saveHistoryByEmail, type SheetHistoryEntry } from "../firebase/data";

function buildDisplaySerialMap(rows: { customerName: string; serialNumber: number }[]): string[] {
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

function getCustomerCount(rows: { customerName: string; serialNumber: number }[]): number {
  const customerNames = new Set<string>();
  let unnamedCount = 0;

  rows.forEach((row) => {
    const key = row.customerName.trim().toLowerCase();
    if (key) {
      customerNames.add(key);
    } else {
      unnamedCount += 1;
    }
  });

  return customerNames.size + unnamedCount;
}

function buildGroupStartIndices(rows: { customerName: string }[]): number[] {
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
  groupStartIndices.forEach((start) => { groupSizes[start] += 1; });
  return groupStartIndices.map((start, index) => (start === index ? groupSizes[start] : 0));
}

function buildCombinedTotals(rows: { days: number[] }[], groupStartIndices: number[]): number[] {
  const totals = rows.map((row) => row.days.reduce((sum, value) => sum + value, 0));
  const groupSums = new Array(rows.length).fill(0);
  groupStartIndices.forEach((start, index) => { groupSums[start] += totals[index]; });
  return groupStartIndices.map((start, index) => (start === index ? groupSums[start] : 0));
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function downloadSheetAsPdf(entry: SheetHistoryEntry, sheetNumber: number) {
  const doc = new jsPDF({ orientation: "landscape" });
  const displaySerialNumbers = buildDisplaySerialMap(entry.rows);
  const groupStartIndices = buildGroupStartIndices(entry.rows);
  const nameCellSpans = buildNameCellSpans(groupStartIndices);
  const combinedTotals = buildCombinedTotals(entry.rows, groupStartIndices);

  const total = entry.rows.reduce(
    (entryTotal, row) => entryTotal + row.days.reduce((rowTotal, value) => rowTotal + value, 0),
    0
  );

  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("RAIPUR DUGDH UTPADAN ASSOCIATION", pageWidth / 2, 8, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(`${entry.name || `Sheet ${sheetNumber}`} · ${getCustomerCount(entry.rows)} Customer · ${entry.dayCount} days · Total ${total}`, pageWidth / 2, 15, { align: "center" });

  const head = [
    ["S No", "Customer Name", "Shift", ...Array.from({ length: entry.dayCount }, (_, i) => `Day ${i + 1}`), "Total"],
  ];

  const body = entry.rows.map((row, index) => {
    const rowTotal = row.days.reduce((sum, v) => sum + v, 0);
    const nameSpan = nameCellSpans[index];
    const displayTotal = nameSpan > 1 ? combinedTotals[index] : rowTotal;

    if (nameSpan > 0) {
      return [
        nameSpan > 1
          ? { content: String(displaySerialNumbers[index] ?? String(row.serialNumber)), rowSpan: nameSpan }
          : displaySerialNumbers[index] ?? String(row.serialNumber),
        nameSpan > 1
          ? { content: row.customerName, rowSpan: nameSpan }
          : row.customerName,
        row.shift || "-",
        ...row.days,
        nameSpan > 1
          ? { content: String(displayTotal), rowSpan: nameSpan }
          : displayTotal
      ];
    }

    return [row.shift || "-", ...row.days];
  });

  autoTable(doc, {
    head,
    body,
    startY: 22,
    styles: { fontSize: 7, cellPadding: 1.5, halign: "center" },
    headStyles: { fillColor: [71, 85, 105], textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "left" } },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      const raw = data.cell.raw as { rowSpan?: number; content?: string } | string | number | null;
      if (
        data.section === "body" &&
        raw &&
        typeof raw === "object" &&
        "rowSpan" in raw &&
        typeof raw.rowSpan === "number" &&
        raw.rowSpan > 1
      ) {
        data.cell.text = [""];
        data.cell.styles.valign = "middle";
      }
    },
    didDrawCell: (data) => {
      const raw = data.cell.raw as { rowSpan?: number; content?: string } | string | number | null;
      if (
        data.section === "body" &&
        raw &&
        typeof raw === "object" &&
        "rowSpan" in raw &&
        typeof raw.rowSpan === "number" &&
        raw.rowSpan > 1
      ) {
        const content = String(raw.content ?? "");
        const centerY = data.cell.y + data.cell.height / 2;

        if (data.column.index === 1) {
          data.doc.text(content, data.cell.x + 2, centerY, { baseline: "middle" });
        } else {
          data.doc.text(content, data.cell.x + data.cell.width / 2, centerY, {
            align: "center",
            baseline: "middle"
          });
        }
      }
    },
  });

  doc.save(`${(entry.name || `dairy-farm-sheet-${sheetNumber}`).replace(/[^a-z0-9_-]+/gi, "-")}-${entry.savedAt.replace(/[:.]/g, "-")}.pdf`);
}


function History() {
  const [history, setHistory] = useState<SheetHistoryEntry[]>([]);

  useEffect(() => {
    const activeUser = getActiveUser();
    if (!activeUser?.email) {
      setHistory([]);
      return;
    }

    void getHistoryByEmail(activeUser.email).then(setHistory);
  }, []);

  const deleteSheet = async (entryId: string) => {
    const activeUser = getActiveUser();
    if (!activeUser?.email) {
      return;
    }

    const nextHistory = history.filter((entry) => entry.id !== entryId);

    setHistory(nextHistory);
    await saveHistoryByEmail(activeUser.email, nextHistory);
  };

  return (
    <section className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">History</h1>
        <p className="mt-1 text-xs md:text-sm text-slate-600">
          Saved sheet snapshots appear here after you archive them.
        </p>
      </div>

      <div className="space-y-4 md:space-y-6">
        {history.length === 0 ? (
          <div className="rounded-lg md:rounded-xl border border-slate-200 bg-white p-4 md:p-6 text-xs md:text-sm text-slate-600 shadow-sm">
            No history saved yet.
          </div>
        ) : (
          history.map((entry, index) => {
            const total = entry.rows.reduce(
              (entryTotal, row) =>
                entryTotal + row.days.reduce((rowTotal, value) => rowTotal + value, 0),
              0
            );

            return (
              <div key={entry.id} className="rounded-lg md:rounded-xl border border-slate-200 bg-white p-3 md:p-4 shadow-sm">
                <div className="mb-3 md:mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 md:gap-3">
                  <div>
                    <h2 className="text-base md:text-lg font-semibold text-slate-800">{entry.name || `Sheet ${history.length - index}`}</h2>
                    <p className="text-xs md:text-sm text-slate-500">Saved on {formatDate(entry.savedAt)}</p>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 md:gap-2 text-xs md:text-sm text-slate-600">
                    <span className="font-medium">
                      {getCustomerCount(entry.rows)} Customer · {entry.dayCount} days · Total {total}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => downloadSheetAsPdf(entry, history.length - index)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition flex-1 sm:flex-none"
                  >
                    Save to Local Device
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void deleteSheet(entry.id);
                    }}
                    className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 transition flex-1 sm:flex-none"
                  >
                    Delete Sheet
                  </button>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-[900px] border-collapse text-center text-xs">
                    <thead className="bg-slate-100 font-semibold text-slate-800">
                      <tr>
                        <th className="border border-slate-300 px-1 md:px-2 py-1 md:py-2">S No</th>
                        <th className="border border-slate-300 px-1 md:px-2 py-1 md:py-2">Customer Name</th>
                        <th className="border border-slate-300 px-1 md:px-2 py-1 md:py-2">Shift</th>
                        {Array.from({ length: entry.dayCount }, (_, dayIndex) => (
                          <th key={dayIndex} className="border border-slate-300 px-1 md:px-2 py-1 md:py-2">
                            Day {dayIndex + 1}
                          </th>
                        ))}
                        <th className="border border-slate-300 px-1 md:px-2 py-1 md:py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const displaySerialNumbers = buildDisplaySerialMap(entry.rows);
                        const groupStartIndices = buildGroupStartIndices(entry.rows);
                        const nameCellSpans = buildNameCellSpans(groupStartIndices);
                        const combinedTotals = buildCombinedTotals(entry.rows, groupStartIndices);

                        return entry.rows.map((row, index) => {
                        const rowTotal = row.days.reduce((sum, value) => sum + value, 0);
                        const nameSpan = nameCellSpans[index];
                        const displayTotal = nameSpan > 1 ? combinedTotals[index] : rowTotal;

                        return (
                          <tr key={row.serialNumber} className="even:bg-slate-50">
                            {nameSpan > 0 && (
                              <td rowSpan={nameSpan} className="border border-slate-200 px-1 md:px-2 py-1 md:py-1 font-semibold align-middle" style={{ verticalAlign: "middle" }}>{displaySerialNumbers[index]}</td>
                            )}
                            {nameSpan > 0 && (
                              <td rowSpan={nameSpan} className="border border-slate-200 px-1 md:px-2 py-1 md:py-1 text-left align-middle">{row.customerName}</td>
                            )}
                            <td className="border border-slate-200 px-1 md:px-2 py-1 md:py-1">{row.shift || "—"}</td>
                            {row.days.map((dayValue, dayIndex) => (
                              <td key={`${row.serialNumber}-${dayIndex}`} className="border border-slate-200 px-1 md:px-2 py-1 md:py-1">
                                {dayValue}
                              </td>
                            ))}
                            {nameSpan > 0 && (
                              <td rowSpan={nameSpan} className="border border-slate-200 px-1 md:px-2 py-1 md:py-1 font-semibold align-middle">{displayTotal}</td>
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
          })
        )}
      </div>
    </section>
  );
}

export default History;
