import { useEffect, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getActiveUser } from "../firebase/auth";
import { getHistoryByEmail, saveHistoryByEmail, type SheetHistoryEntry } from "../firebase/data";

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function downloadSheetAsPdf(entry: SheetHistoryEntry, sheetNumber: number) {
  const doc = new jsPDF({ orientation: "landscape" });

  const total = entry.rows.reduce(
    (entryTotal, row) => entryTotal + row.days.reduce((rowTotal, value) => rowTotal + value, 0),
    0
  );

  doc.setFontSize(14);
  doc.text(`Dairy Farm — Sheet ${sheetNumber}`, 14, 15);
  doc.setFontSize(9);
  doc.text(`Saved: ${formatDate(entry.savedAt)}   |   Rows: ${entry.rows.length}   |   Days: ${entry.dayCount}   |   Total: ${total}`, 14, 22);

  const head = [
    ["S No", "Customer Name", ...Array.from({ length: entry.dayCount }, (_, i) => `Day ${i + 1}`), "Total"],
  ];

  const body = entry.rows.map((row) => {
    const rowTotal = row.days.reduce((sum, v) => sum + v, 0);
    return [row.serialNumber, row.customerName, ...row.days, rowTotal];
  });

  autoTable(doc, {
    head,
    body,
    startY: 27,
    styles: { fontSize: 7, cellPadding: 1.5, halign: "center" },
    headStyles: { fillColor: [71, 85, 105], textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "left" } },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.save(`dairy-farm-sheet-${sheetNumber}-${entry.savedAt.replace(/[:.]/g, "-")}.pdf`);
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
          Saved 16-day sheet snapshots appear here after you archive them.
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
                    <h2 className="text-base md:text-lg font-semibold text-slate-800">Sheet {history.length - index}</h2>
                    <p className="text-xs md:text-sm text-slate-500">Saved on {formatDate(entry.savedAt)}</p>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 md:gap-2 text-xs md:text-sm text-slate-600">
                    <span className="font-medium">
                      {entry.rows.length} rows · {entry.dayCount} days · Total {total}
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
                        {Array.from({ length: entry.dayCount }, (_, dayIndex) => (
                          <th key={dayIndex} className="border border-slate-300 px-1 md:px-2 py-1 md:py-2">
                            Day {dayIndex + 1}
                          </th>
                        ))}
                        <th className="border border-slate-300 px-1 md:px-2 py-1 md:py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.rows.map((row) => {
                        const rowTotal = row.days.reduce((sum, value) => sum + value, 0);

                        return (
                          <tr key={row.serialNumber} className="even:bg-slate-50">
                            <td className="border border-slate-200 px-1 md:px-2 py-1 md:py-1">{row.serialNumber}</td>
                            <td className="border border-slate-200 px-1 md:px-2 py-1 md:py-1 text-left">{row.customerName}</td>
                            {row.days.map((dayValue, dayIndex) => (
                              <td key={`${row.serialNumber}-${dayIndex}`} className="border border-slate-200 px-1 md:px-2 py-1 md:py-1">
                                {dayValue}
                              </td>
                            ))}
                            <td className="border border-slate-200 px-1 md:px-2 py-1 md:py-1 font-semibold">{rowTotal}</td>
                          </tr>
                        );
                      })}
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
