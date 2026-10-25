import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import { getActiveUser } from "../firebase/auth";
import { getHistoryByEmail, saveHistoryByEmail, type SheetHistoryEntry } from "../firebase/data";
import { saveFile, shareFile } from "../utils/nativeFiles";

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

function getEffectiveDayCount(entry: { dayCount: number; rows: { days: number[] }[] }): number {
  let max = 0;
  entry.rows.forEach((row) => {
    row.days.forEach((value, idx) => {
      if (value !== 0 && idx + 1 > max) {
        max = idx + 1;
      }
    });
  });
  return max > 0 ? max : entry.dayCount;
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

function displayText(value: string): string {
  return value.trim() || "-";
}

function displayDayValue(value: number): string | number {
  return value === 0 ? "-" : value;
}

function buildSheetPdfBlob(entry: SheetHistoryEntry, sheetNumber: number): Blob {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true
  });

  const effectiveDayCount = getEffectiveDayCount(entry);
  const displaySerialNumbers = buildDisplaySerialMap(entry.rows);

  const total = entry.rows.reduce(
    (entryTotal, row) =>
      entryTotal +
      row.days
        .slice(0, effectiveDayCount)
        .reduce((rowTotal, value) => rowTotal + value, 0),
    0
  );

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 5;

  // Same header hierarchy as the saved History sheet.
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("RAIPUR DUGDH UTPADAN ASSOCIATION", pageWidth / 2, 8, {
    align: "center"
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `${entry.name || `Sheet ${sheetNumber}`} · ${getCustomerCount(entry.rows)} Customer · ${effectiveDayCount} days · Total ${total}`,
    pageWidth / 2,
    14,
    { align: "center" }
  );

  const head = [[
    "S No",
    "Customer Name",
    "Shift",
    ...Array.from(
      { length: effectiveDayCount },
      (_, index) => `Day ${index + 1}`
    ),
    "Total"
  ]];

  const body: any[][] = [];

  for (let index = 0; index < entry.rows.length; index += 1) {
    const row = entry.rows[index];
    const nextRow = entry.rows[index + 1];

    const sameCustomerAsNext =
      Boolean(nextRow?.customerName.trim()) &&
      nextRow.customerName.trim().toLowerCase() ===
        row.customerName.trim().toLowerCase();

    const previousRow = entry.rows[index - 1];
    const sameCustomerAsPrevious =
      Boolean(previousRow?.customerName.trim()) &&
      previousRow.customerName.trim().toLowerCase() ===
        row.customerName.trim().toLowerCase();

    const rowTotal = row.days
      .slice(0, effectiveDayCount)
      .reduce((sum, value) => sum + value, 0);

    // First row of a two-shift customer: merge S No, Name and Total.
    if (sameCustomerAsNext && !sameCustomerAsPrevious) {
      const combinedTotal =
        rowTotal +
        nextRow.days
          .slice(0, effectiveDayCount)
          .reduce((sum, value) => sum + value, 0);

      body.push([
        {
          content: String(displaySerialNumbers[index] ?? row.serialNumber),
          rowSpan: 2
        },
        {
          content: displayText(row.customerName),
          rowSpan: 2
        },
        displayText(row.shift),
        ...row.days.slice(0, effectiveDayCount).map(displayDayValue),
        {
          content: String(combinedTotal),
          rowSpan: 2
        }
      ]);

      continue;
    }

    // Second row of a two-shift customer.
    // Do NOT add placeholders for the row-spanned columns.
    if (sameCustomerAsPrevious) {
      body.push([
        displayText(row.shift),
        ...row.days.slice(0, effectiveDayCount).map(displayDayValue)
      ]);

      continue;
    }

    // Single-shift customer.
    body.push([
      String(displaySerialNumbers[index] ?? row.serialNumber),
      displayText(row.customerName),
      displayText(row.shift),
      ...row.days.slice(0, effectiveDayCount).map(displayDayValue),
      String(rowTotal)
    ]);
  }

  autoTable(doc, {
    head,
    body,
    startY: 20,
    margin: {
      left: marginX,
      right: marginX,
      top: 20,
      bottom: 5
    },
    tableWidth: pageWidth - marginX * 2,
    theme: "grid",
    showHead: "everyPage",
    pageBreak: "auto",
    rowPageBreak: "avoid",

    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 1.15,
      overflow: "hidden",
      halign: "center",
      valign: "middle",
      textColor: [30, 41, 59],
      lineColor: [203, 213, 225],
      lineWidth: 0.15,
      minCellHeight: 6.8
    },

    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [30, 41, 59],
      fontStyle: "bold",
      fontSize: 9,
      halign: "center",
      valign: "middle",
      lineColor: [203, 213, 225],
      lineWidth: 0.15,
      cellPadding: 1.15,
      minCellHeight: 7
    },

    bodyStyles: {
      fillColor: [255, 255, 255],
      lineColor: [203, 213, 225],
      lineWidth: 0.15
    },

    columnStyles: {
      0: {
        cellWidth: 14,
        halign: "center"
      },
      1: {
        cellWidth: 25,
        halign: "center"
      },
      2: {
        cellWidth: 10,
        halign: "center"
      },
      [3 + effectiveDayCount]: {
        cellWidth: 16,
        halign: "center"
      }
    }
  });

  return doc.output("blob");
}


function getSheetPdfFileName(entry: SheetHistoryEntry, sheetNumber: number): string {
  return `${(entry.name || `Sheet ${sheetNumber}`).replace(/[^a-z0-9_-]+/gi, "-")}.pdf`;
}

async function downloadSheetAsPdf(entry: SheetHistoryEntry, sheetNumber: number) {
  const blob = buildSheetPdfBlob(entry, sheetNumber);
  await saveFile(blob, getSheetPdfFileName(entry, sheetNumber));
}

async function shareSheetAsPdf(entry: SheetHistoryEntry, sheetNumber: number) {
  const blob = buildSheetPdfBlob(entry, sheetNumber);
  await shareFile(blob, getSheetPdfFileName(entry, sheetNumber), entry.name || `Sheet ${sheetNumber}`);
}


function downloadSheetAsExcel(entry: SheetHistoryEntry, sheetNumber: number) {
  void (async () => {
    const effectiveDayCount = getEffectiveDayCount(entry);
    const displaySerialNumbers = buildDisplaySerialMap(entry.rows);
    const groupStartIndices = buildGroupStartIndices(entry.rows);
    const nameCellSpans = buildNameCellSpans(groupStartIndices);
    const combinedTotals = buildCombinedTotals(entry.rows, groupStartIndices);

    const total = entry.rows.reduce(
      (entryTotal, row) => entryTotal + row.days.reduce((rowTotal, value) => rowTotal + value, 0),
      0
    );

    const columnCount = 4 + effectiveDayCount;
    const title = `${entry.name || `Sheet ${sheetNumber}`} · ${getCustomerCount(entry.rows)} Customer · ${effectiveDayCount} days · Total ${total}`;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sheet1", {
      views: [{ showGridLines: false }],
    });

    const thinBorder = {
      top: { style: "thin" as const, color: { argb: "FFCBD5E1" } },
      left: { style: "thin" as const, color: { argb: "FFCBD5E1" } },
      bottom: { style: "thin" as const, color: { argb: "FFCBD5E1" } },
      right: { style: "thin" as const, color: { argb: "FFCBD5E1" } },
    };

    worksheet.mergeCells(1, 1, 1, columnCount);
    const titleCell = worksheet.getCell(1, 1);
    titleCell.value = "RAIPUR DUGDH UTPADAN ASSOCIATION";
    titleCell.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF0F172A" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(1).height = 22;

    worksheet.mergeCells(2, 1, 2, columnCount);
    const subtitleCell = worksheet.getCell(2, 1);
    subtitleCell.value = title;
    subtitleCell.font = { name: "Calibri", size: 11, color: { argb: "FF334155" } };
    subtitleCell.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(2).height = 18;

    const headerRowIndex = 4;
    const headerValues = [
      "S No",
      "Customer Name",
      "Shift",
      ...Array.from({ length: effectiveDayCount }, (_, i) => `Day ${i + 1}`),
      "Total",
    ];
    const headerRow = worksheet.getRow(headerRowIndex);
    headerRow.values = headerValues;
    headerRow.height = 20;
    headerRow.eachCell((cell) => {
      cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF475569" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = thinBorder;
    });

    entry.rows.forEach((row, index) => {
      const rowTotal = row.days.reduce((sum, v) => sum + v, 0);
      const nameSpan = nameCellSpans[index];
      const displayTotal = nameSpan > 1 ? combinedTotals[index] : rowTotal;
      const rowIndex = headerRowIndex + 1 + index;

      const values = [
        nameSpan > 0 ? displaySerialNumbers[index] ?? String(row.serialNumber) : "",
        nameSpan > 0 ? displayText(row.customerName) : "",
        displayText(row.shift),
        ...row.days.slice(0, effectiveDayCount).map(displayDayValue),
        nameSpan > 0 ? displayTotal : "",
      ];

      const excelRow = worksheet.getRow(rowIndex);
      excelRow.values = values;
      excelRow.eachCell((cell, colNumber) => {
        cell.border = thinBorder;
        cell.alignment = { horizontal: colNumber === 2 ? "left" : "center", vertical: "middle" };
        cell.font = { name: "Calibri", size: 10 };
        if (index % 2 === 1) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        }
        if (colNumber === 1 || colNumber === columnCount) {
          cell.font = { name: "Calibri", size: 10, bold: true };
        }
      });
    });

    entry.rows.forEach((_, index) => {
      const nameSpan = nameCellSpans[index];
      if (nameSpan > 1) {
        const startRow = headerRowIndex + 1 + index;
        const endRow = headerRowIndex + index + nameSpan;
        worksheet.mergeCells(startRow, 1, endRow, 1);
        worksheet.mergeCells(startRow, 2, endRow, 2);
        worksheet.mergeCells(startRow, columnCount, endRow, columnCount);
        worksheet.getCell(startRow, 1).alignment = { horizontal: "center", vertical: "middle" };
        worksheet.getCell(startRow, 2).alignment = { horizontal: "left", vertical: "middle" };
        worksheet.getCell(startRow, columnCount).alignment = { horizontal: "center", vertical: "middle" };
      }
    });

    worksheet.columns = [
      { width: 8 },
      { width: 22 },
      { width: 8 },
      ...Array.from({ length: effectiveDayCount }, () => ({ width: 8 })),
      { width: 10 },
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await saveFile(
      blob,
      `${(entry.name || `Sheet ${sheetNumber}`).replace(/[^a-z0-9_-]+/gi, "-")}.xlsx`
    );
  })();
}

function History() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [history, setHistory] = useState<SheetHistoryEntry[]>([]);
  const [openSaveMenu, setOpenSaveMenu] = useState<string | null>(null);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(() => searchParams.get("sheet"));
  const [editingNameEntryId, setEditingNameEntryId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const visibleHistory = history.filter((entry) => entry.archived !== true);

  const filteredHistory = visibleHistory.filter((entry, index) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    const name = (entry.name || `Sheet ${visibleHistory.length - index}`).toLowerCase();
    const date = formatDate(entry.savedAt).toLowerCase();
    return name.includes(q) || date.includes(q);
  });

  useEffect(() => {
    const activeUser = getActiveUser();
    if (!activeUser?.email) {
      setHistory([]);
      return;
    }

    void getHistoryByEmail(activeUser.email, true).then(setHistory);
  }, []);

  useEffect(() => {
    const nextParams = new URLSearchParams();
    if (expandedEntryId) {
      nextParams.set("sheet", expandedEntryId);
    }
    setSearchParams(nextParams, { replace: true });
  }, [expandedEntryId, setSearchParams]);

  const deleteSheet = async (entryId: string) => {
    const activeUser = getActiveUser();
    if (!activeUser?.email) {
      return;
    }

    const nextHistory = history.filter((entry) => entry.id !== entryId);

    setHistory(nextHistory);
    if (expandedEntryId === entryId) {
      setExpandedEntryId(null);
    }
    await saveHistoryByEmail(activeUser.email, nextHistory);
  };

  const renameSheet = async (entryId: string, newName: string) => {
    const activeUser = getActiveUser();
    if (!activeUser?.email) {
      return;
    }

    const nextHistory = history.map((entry) =>
      entry.id === entryId ? { ...entry, name: newName.trim() } : entry
    );

    setHistory(nextHistory);
    await saveHistoryByEmail(activeUser.email, nextHistory);
  };

  return (
    <section className="space-y-4 md:space-y-6">
      {/* Header & Instant Search in Same Row */}
      <div className="flex items-center justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg sm:text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
            Sheet History
          </h1>
          <p className="hidden sm:block mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Archived snapshots and historical milk collection records
          </p>
        </div>

        {/* Live Search Input in Same Row */}
        <div className="relative w-44 sm:w-64 md:w-72 shrink-0">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sheets..."
            className="w-full rounded-full border border-slate-200 bg-white py-2 pl-8 pr-7 text-xs text-slate-900 shadow-xs outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-[#282828] dark:bg-[#1c1c1c] dark:text-white"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3.5 md:space-y-4">
        {visibleHistory.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-card dark:border-[#282828] dark:bg-[#1c1c1c]">
            <p className="text-3xl">📁</p>
            <p className="mt-2 text-sm font-bold text-slate-800 dark:text-white">No history saved yet</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Saved sheet snapshots will appear here after you archive them.</p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card dark:border-[#282828] dark:bg-[#1c1c1c]">
            <p className="text-3xl">🔍</p>
            <p className="mt-2 text-sm font-bold text-slate-800 dark:text-white">No matching sheets</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">No sheet matched your search "{searchQuery}". Try clearing the search query.</p>
          </div>
        ) : (
          filteredHistory.map((entry, index) => {
            const effectiveDayCount = getEffectiveDayCount(entry);
            const total = entry.rows.reduce(
              (entryTotal, row) =>
                entryTotal +
                row.days
                  .slice(0, effectiveDayCount)
                  .reduce((rowTotal, value) => rowTotal + value, 0),
              0
            );

            const isExpanded = expandedEntryId === entry.id;
            const sheetTitle = entry.name || `Sheet ${visibleHistory.length - index}`;

            return (
              <div
                key={entry.id}
                className="rounded-2xl border border-slate-200 bg-white shadow-card dark:border-[#282828] dark:bg-[#1c1c1c] transition overflow-hidden"
              >
                {/* Accordion Toggle Header */}
                <div
                  onClick={() => setExpandedEntryId(isExpanded ? null : entry.id)}
                  className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition select-none"
                >
                  <div className="space-y-0.5 sm:space-y-1 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5 truncate">
                        <span>📑</span> {sheetTitle}
                      </span>

                      {/* Mobile only: customer stats & arrow on the same row as sheet name */}
                      <div className="flex sm:hidden items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 shrink-0 font-medium">
                        <span>
                          {getCustomerCount(entry.rows)} Customers · {effectiveDayCount} days · Total {total.toLocaleString("en-IN")}
                        </span>
                        <span className={`text-[10px] text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : "rotate-0"}`}>
                          ▼
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <span>🕒</span> Saved on {formatDate(entry.savedAt)}
                    </p>
                  </div>

                  {/* Desktop only: Glanceable Metric Pills & Chevron */}
                  <div className="hidden sm:flex items-center justify-end gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 rounded-xl bg-blue-500/10 px-2.5 py-1 text-xs font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 border border-blue-500/20">
                        👥 {getCustomerCount(entry.rows)} Customers
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-xl bg-indigo-500/10 px-2.5 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 border border-indigo-500/20">
                        📅 {effectiveDayCount} Days
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/10 px-2.5 py-1 text-xs font-black text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-500/25">
                        ₹{total.toLocaleString("en-IN")}
                      </span>
                    </div>
                    {/* Animated Chevron */}
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-white/5 text-xs text-slate-500 dark:text-slate-400 transition-transform duration-200 ${
                        isExpanded ? "rotate-180" : "rotate-0"
                      }`}
                    >
                      ▼
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 p-3.5 sm:p-4 space-y-3.5 bg-slate-50/40 dark:border-[#282828] dark:bg-[#181818]">
                    {/* Mobile Toolbar (Balanced 2-Tier Layout) */}
                    <div className="flex flex-col gap-2 sm:hidden">
                      {/* Full-width primary CTA */}
                      <button
                        type="button"
                        onClick={() => navigate(`/customer-details?edit=${encodeURIComponent(entry.id)}`)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-brand-600 active:scale-[0.99] transition min-h-[42px]"
                      >
                        <span>✏️</span> Edit Sheet
                      </button>

                      {/* 4-column balanced action bar */}
                      <div className="grid grid-cols-4 gap-1.5">
                        {/* Export Dropdown */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setOpenSaveMenu(openSaveMenu === entry.id ? null : entry.id)}
                            className="flex w-full min-h-[38px] items-center justify-center gap-1 rounded-xl bg-emerald-500 py-2 text-[11px] font-semibold text-white shadow-xs hover:bg-emerald-600 active:scale-95 transition"
                          >
                            <span>📥</span> Download
                          </button>
                          {openSaveMenu === entry.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setOpenSaveMenu(null)} />
                              <div className="absolute left-0 top-full mt-1.5 w-48 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden z-30 text-xs font-medium dark:border-[#333] dark:bg-[#222]">
                                <button
                                  type="button"
                                  onClick={() => {
                                    downloadSheetAsPdf(entry, visibleHistory.length - index);
                                    setOpenSaveMenu(null);
                                  }}
                                  className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-white/10 flex items-center gap-2 text-slate-700 dark:text-slate-200"
                                >
                                  <span>📄</span> Download PDF
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    downloadSheetAsExcel(entry, visibleHistory.length - index);
                                    setOpenSaveMenu(null);
                                  }}
                                  className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-white/10 flex items-center gap-2 border-t border-slate-100 dark:border-[#333] text-slate-700 dark:text-slate-200"
                                >
                                  <span>📊</span> Download Excel (.xlsx)
                                </button>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Share */}
                        <button
                          type="button"
                          onClick={() => {
                            void shareSheetAsPdf(entry, visibleHistory.length - index);
                          }}
                          className="flex min-h-[38px] items-center justify-center gap-1 rounded-xl bg-violet-500 py-2 text-[11px] font-semibold text-white shadow-xs hover:bg-violet-600 active:scale-95 transition"
                        >
                          <span>📤</span> Share
                        </button>

                        {/* Rename */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNameEntryId(entry.id);
                            setNameDraft(entry.name || "");
                          }}
                          className="flex min-h-[38px] items-center justify-center gap-1 rounded-xl bg-amber-500 py-2 text-[11px] font-semibold text-white shadow-xs hover:bg-amber-600 active:scale-95 transition"
                        >
                          <span>🏷️</span> Rename
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => setDeleteTargetId(entry.id)}
                          className="flex min-h-[38px] items-center justify-center gap-1 rounded-xl bg-red-500 py-2 text-[11px] font-semibold text-white shadow-xs hover:bg-red-600 active:scale-95 transition"
                        >
                          <span>🗑️</span> Delete
                        </button>
                      </div>
                    </div>

                    {/* Desktop Toolbar (Single Clean Row) */}
                    <div className="hidden sm:flex sm:items-center sm:justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2.5 dark:border-[#2e2e2e] dark:bg-[#202020]">
                      <div className="flex items-center gap-2">
                        {/* Open in Sheet Editor */}
                        <button
                          type="button"
                          onClick={() => navigate(`/customer-details?edit=${encodeURIComponent(entry.id)}`)}
                          className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-600 active:scale-95 transition min-h-[38px]"
                        >
                          <span>✏️</span> Edit Sheet
                        </button>

                        {/* Export Dropdown */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setOpenSaveMenu(openSaveMenu === entry.id ? null : entry.id)}
                            className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-600 active:scale-95 transition min-h-[38px]"
                          >
                            <span>📥</span> Download Sheet ▼
                          </button>
                          {openSaveMenu === entry.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setOpenSaveMenu(null)} />
                              <div className="absolute left-0 top-full mt-1.5 w-48 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden z-30 text-xs font-medium dark:border-[#333] dark:bg-[#222]">
                                <button
                                  type="button"
                                  onClick={() => {
                                    downloadSheetAsPdf(entry, visibleHistory.length - index);
                                    setOpenSaveMenu(null);
                                  }}
                                  className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-white/10 flex items-center gap-2 text-slate-700 dark:text-slate-200"
                                >
                                  <span>📄</span> Download PDF
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    downloadSheetAsExcel(entry, visibleHistory.length - index);
                                    setOpenSaveMenu(null);
                                  }}
                                  className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-white/10 flex items-center gap-2 border-t border-slate-100 dark:border-[#333] text-slate-700 dark:text-slate-200"
                                >
                                  <span>📊</span> Download Excel (.xlsx)
                                </button>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Share Button */}
                        <button
                          type="button"
                          onClick={() => {
                            void shareSheetAsPdf(entry, visibleHistory.length - index);
                          }}
                          className="flex items-center gap-1.5 rounded-xl bg-violet-500 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-violet-600 active:scale-95 transition min-h-[38px]"
                        >
                          <span>📤</span> Share Sheet
                        </button>
                      </div>

                      {/* Management Actions */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNameEntryId(entry.id);
                            setNameDraft(entry.name || "");
                          }}
                          className="flex items-center gap-1 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-amber-600 active:scale-95 transition min-h-[38px]"
                        >
                          <span>🏷️</span> Rename Sheet
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTargetId(entry.id)}
                          className="flex items-center gap-1 rounded-xl bg-red-500 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-red-600 active:scale-95 transition min-h-[38px]"
                        >
                          <span>🗑️</span> Delete Sheet
                        </button>
                      </div>
                    </div>

                    {/* Inline Rename Form */}
                    {editingNameEntryId === entry.id && (
                      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center dark:border-[#2e2e2e] dark:bg-[#202020]">
                        <input
                          type="text"
                          autoFocus
                          value={nameDraft}
                          onChange={(event) => setNameDraft(event.target.value)}
                          placeholder="e.g. October Final Period"
                          className="h-10 flex-1 rounded-xl border border-slate-300 bg-slate-50/70 px-3 text-xs sm:text-sm text-slate-900 outline-none focus:border-brand-500 focus:bg-white dark:border-[#333] dark:bg-[#262626] dark:text-white"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void renameSheet(entry.id, nameDraft);
                              setEditingNameEntryId(null);
                            }}
                            className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingNameEntryId(null)}
                            className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-[#333] dark:text-slate-300 dark:hover:bg-[#2a2a2a] transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Historical Table View */}
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs dark:border-[#2e2e2e] dark:bg-[#1a1a1a] custom-scrollbar">
                      <table className="w-full min-w-[700px] border-collapse text-center text-xs">
                        <thead className="bg-slate-50/80 font-bold uppercase tracking-wider text-[11px] text-slate-500 dark:bg-[#222] dark:text-slate-400 border-b border-slate-200 dark:border-[#2e2e2e]">
                          <tr>
                            <th className="py-2.5 px-2 w-12 border-r border-slate-200 dark:border-[#2e2e2e]">S.No</th>
                            <th className="py-2.5 px-3 text-left border-r border-slate-200 dark:border-[#2e2e2e]">Customer Name</th>
                            <th className="py-2.5 px-2 w-14 border-r border-slate-200 dark:border-[#2e2e2e]">Shift</th>
                            {Array.from({ length: effectiveDayCount }, (_, dayIndex) => (
                              <th key={dayIndex} className="py-2.5 px-2 border-r border-slate-200 dark:border-[#2e2e2e]">
                                Day {dayIndex + 1}
                              </th>
                            ))}
                            <th className="py-2.5 px-3 font-bold text-blue-600 dark:text-blue-400">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-[#262626]">
                          {(() => {
                            const displaySerialNumbers = buildDisplaySerialMap(entry.rows);
                            const groupStartIndices = buildGroupStartIndices(entry.rows);
                            const nameCellSpans = buildNameCellSpans(groupStartIndices);
                            const combinedTotals = buildCombinedTotals(entry.rows, groupStartIndices);

                            return entry.rows.map((row, rowIndex) => {
                              const rowTotal = row.days.reduce((sum, value) => sum + value, 0);
                              const nameSpan = nameCellSpans[rowIndex];
                              const displayTotal = nameSpan > 1 ? combinedTotals[rowIndex] : rowTotal;
                              const isMorning = row.shift.trim().toUpperCase() === "M";
                              const isEvening = row.shift.trim().toUpperCase() === "E";

                              return (
                                <tr key={`${row.serialNumber}-${rowIndex}`} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
                                  {nameSpan > 0 && (
                                    <td
                                      rowSpan={nameSpan}
                                      className="py-2 px-2 font-bold text-slate-400 border-r border-slate-200 dark:border-[#2e2e2e] bg-slate-50/30 dark:bg-[#1c1c1c] align-middle"
                                    >
                                      {displaySerialNumbers[rowIndex]}
                                    </td>
                                  )}
                                  {nameSpan > 0 && (
                                    <td
                                      rowSpan={nameSpan}
                                      className="py-2 px-3 text-left font-bold text-slate-900 dark:text-white border-r border-slate-200 dark:border-[#2e2e2e] bg-slate-50/30 dark:bg-[#1c1c1c] align-middle"
                                    >
                                      {row.customerName.trim() || "-"}
                                    </td>
                                  )}
                                  <td className="py-2 px-2 border-r border-slate-200 dark:border-[#2e2e2e]">
                                    {isMorning ? (
                                      <span className="inline-block rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-500/20">
                                        M
                                      </span>
                                    ) : isEvening ? (
                                      <span className="inline-block rounded-md bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 border border-violet-500/20">
                                        E
                                      </span>
                                    ) : (
                                      <span className="text-slate-500">{row.shift.trim() || "-"}</span>
                                    )}
                                  </td>
                                  {row.days.slice(0, effectiveDayCount).map((dayValue, dayIndex) => (
                                    <td
                                      key={`${row.serialNumber}-${dayIndex}`}
                                      className="py-2 px-2 font-mono text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-[#2e2e2e]"
                                    >
                                      {dayValue === 0 ? "-" : dayValue}
                                    </td>
                                  ))}
                                  {nameSpan > 0 && (
                                    <td
                                      rowSpan={nameSpan}
                                      className="py-2 px-3 font-mono font-black text-emerald-600 dark:text-emerald-400 bg-slate-50/30 dark:bg-[#1c1c1c] align-middle"
                                    >
                                      ₹{displayTotal}
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
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTargetId && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs p-4 md:items-center"
          onClick={() => setDeleteTargetId(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#2e2e2e] dark:bg-[#1a1a1a]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400 mb-3 text-lg">
              🗑️
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete Sheet Snapshot?</h3>
            <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
              This will permanently delete this saved historical snapshot. This action cannot be undone.
            </p>
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteTargetId(null)}
                className="flex-1 rounded-xl border border-slate-300 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 dark:border-[#333] dark:text-slate-300 dark:hover:bg-[#262626] transition min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void deleteSheet(deleteTargetId);
                  setDeleteTargetId(null);
                }}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-xs font-bold text-white hover:bg-red-700 active:scale-95 shadow-md shadow-red-500/20 transition min-h-[44px]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default History;
