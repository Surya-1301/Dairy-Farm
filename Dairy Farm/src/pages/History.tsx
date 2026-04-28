import { useState } from "react";

type SheetRow = {
  serialNumber: number;
  customerName: string;
  days: number[];
};

type SheetHistoryEntry = {
  id: string;
  savedAt: string;
  dayCount: number;
  rows: SheetRow[];
};

const HISTORY_STORAGE_KEY = "dairy-farm-customer-sheet-history";

function readHistory(): SheetHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  const savedValue = window.localStorage.getItem(HISTORY_STORAGE_KEY);

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

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function buildDownloadFileName(savedAt: string) {
  return `dairy-farm-history-${savedAt.replace(/[:.]/g, "-")}.json`;
}

function downloadSheet(entry: SheetHistoryEntry) {
  const payload = JSON.stringify(entry, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = buildDownloadFileName(entry.savedAt);
  anchor.click();

  URL.revokeObjectURL(url);
}

function History() {
  const [history, setHistory] = useState<SheetHistoryEntry[]>(() => readHistory());

  const deleteSheet = (entryId: string) => {
    const nextHistory = history.filter((entry) => entry.id !== entryId);

    setHistory(nextHistory);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(nextHistory));
    }
  };

  return (
    <section className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">History</h1>
        <p className="mt-1 text-xs md:text-sm text-slate-600">
          Saved 15-day sheet snapshots appear here after you archive them.
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
                    onClick={() => downloadSheet(entry)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition flex-1 sm:flex-none"
                  >
                    Save to Local Device
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSheet(entry.id)}
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
