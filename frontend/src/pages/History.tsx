import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
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

  /*
   * IMPORTANT FOR THE HISTORY LAYOUT:
   *
   * When a customer has both M and E:
   *   S No       -> one merged cell across M + E
   *   Name       -> one merged cell across M + E
   *   Shift      -> M and E are separate rows
   *   Day values -> separate M and E rows
   *   Total      -> one merged cell containing M + E combined total
   *
   * AutoTable rowSpan cells must NOT be repeated as empty cells on the
   * second row. The second row starts at the Shift column. This prevents
   * the Day columns from being shifted.
   */
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
          content: row.customerName,
          rowSpan: 2
        },
        row.shift || "-",
        ...row.days.slice(0, effectiveDayCount).map((value) => String(value)),
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
        row.shift || "-",
        ...row.days.slice(0, effectiveDayCount).map((value) => String(value))
      ]);

      continue;
    }

    // Single-shift customer.
    body.push([
      String(displaySerialNumbers[index] ?? row.serialNumber),
      row.customerName || "",
      row.shift || "-",
      ...row.days.slice(0, effectiveDayCount).map((value) => String(value)),
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
      fontSize: 6.4,
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
      fontSize: 6.4,
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

function downloadSheetAsPdf(entry: SheetHistoryEntry, sheetNumber: number) {
  const blob = buildSheetPdfBlob(entry, sheetNumber);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = getSheetPdfFileName(entry, sheetNumber);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function shareSheetAsPdf(entry: SheetHistoryEntry, sheetNumber: number) {
  const blob = buildSheetPdfBlob(entry, sheetNumber);
  const file = new File([blob], getSheetPdfFileName(entry, sheetNumber), {
    type: "application/pdf"
  });

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: entry.name || `Sheet ${sheetNumber}`,
      text: "Dairy Farm sheet PDF",
      files: [file]
    });
    return;
  }

  // Browsers without file-sharing support cannot attach the generated PDF to
  // the native share sheet. Download the same PDF so the user can share it
  // through the device's Files/Share UI without generating any other format.
  downloadSheetAsPdf(entry, sheetNumber);
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
        nameSpan > 0 ? row.customerName : "",
        row.shift || "-",
        ...row.days.slice(0, effectiveDayCount),
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
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(entry.name || `Sheet ${sheetNumber}`).replace(/[^a-z0-9_-]+/gi, "-")}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
  const visibleHistory = history.filter((entry) => entry.archived !== true);

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
      <div>
        <h1 className="text-xl md:text-3xl font-bold text-slate-900">History</h1>
        <p className="mt-1 text-xs md:text-sm text-slate-600">
          Saved sheet snapshots appear here after you archive them.
        </p>
      </div>

      <div className="space-y-4 md:space-y-6">
        {visibleHistory.length === 0 ? (
          <div className="rounded-lg md:rounded-xl border border-slate-200 bg-white p-4 md:p-6 text-xs md:text-sm text-slate-600 shadow-sm">
            No history saved yet.
          </div>
        ) : (
          visibleHistory.map((entry, index) => {
            const effectiveDayCount = getEffectiveDayCount(entry);
            const total = entry.rows.reduce(
              (entryTotal, row) =>
                entryTotal + row.days.reduce((rowTotal, value) => rowTotal + value, 0),
              0
            );

            const isExpanded = expandedEntryId === entry.id;

            return (
              <div key={entry.id} className="relative rounded-lg md:rounded-xl border border-slate-200 bg-white p-3 md:p-4 shadow-sm">
                <span className="absolute right-3 top-3 text-slate-400 sm:hidden">{isExpanded ? "▲" : "▼"}</span>
                <button
                  type="button"
                  onClick={() => setExpandedEntryId(isExpanded ? null : entry.id)}
                  className="flex w-full flex-col gap-2 pr-6 text-left sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:pr-0 md:gap-3"
                >
                  <div>
                    <h2 className="text-base md:text-lg font-semibold text-slate-800">{entry.name || `Sheet ${visibleHistory.length - index}`}</h2>
                    <p className="text-xs md:text-sm text-slate-500">Saved on {formatDate(entry.savedAt)}</p>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 md:gap-2 text-xs md:text-sm text-slate-600">
                    <span className="font-medium">
                      {getCustomerCount(entry.rows)} Customer · {effectiveDayCount} days · Total {total}
                    </span>
                    <span className="hidden text-slate-400 sm:inline">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </button>

                {isExpanded && (
                <>
                <div className="mt-3 mb-3 grid grid-cols-2 gap-2 sm:flex sm:flex-row">
                  <div className="relative min-w-0 flex-1 sm:flex-none">
                    <button
                      type="button"
                      onClick={() => setOpenSaveMenu(openSaveMenu === entry.id ? null : entry.id)}
                      className="w-full rounded-lg border border-emerald-500 bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 transition"
                    >
                      Save Sheet
                    </button>
                    {openSaveMenu === entry.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenSaveMenu(null)} />
                        <div className="absolute left-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                          <button
                            type="button"
                            onClick={() => {
                              downloadSheetAsPdf(entry, visibleHistory.length - index);
                              setOpenSaveMenu(null);
                            }}
                            className="block w-full px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            Download as PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              downloadSheetAsExcel(entry, visibleHistory.length - index);
                              setOpenSaveMenu(null);
                            }}
                            className="block w-full px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            Download as Excel (.xlsx)
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void shareSheetAsPdf(entry, visibleHistory.length - index);
                    }}
                    className="w-full rounded-lg border border-violet-500 bg-violet-500 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-600 transition sm:w-auto sm:flex-none"
                  >
                    Share PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingNameEntryId(entry.id);
                      setNameDraft(entry.name || "");
                    }}
                    className="w-full rounded-lg border border-amber-500 bg-amber-500 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600 transition sm:w-auto sm:flex-none"
                  >
                    Edit Sheet Name
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/customer-details?edit=${encodeURIComponent(entry.id)}`)}
                    className="w-full rounded-lg border border-sky-500 bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600 transition sm:w-auto sm:flex-none sm:ml-auto"
                  >
                    Edit Sheet
                  </button>
                  <div className="col-span-2 flex justify-center sm:contents">
                    <button
                      type="button"
                      onClick={() => {
                        void deleteSheet(entry.id);
                      }}
                      className="w-full rounded-lg border border-red-500 bg-red-500 px-3 py-2 text-xs font-semibold text-white hover:bg-red-600 transition sm:w-auto sm:flex-none"
                    >
                      Delete Sheet
                    </button>
                  </div>
                </div>

                {editingNameEntryId === entry.id && (
                  <div className="mb-3 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      autoFocus
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value)}
                      placeholder="e.g. Sheet 1"
                      className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void renameSheet(entry.id, nameDraft);
                          setEditingNameEntryId(null);
                        }}
                        className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        Save Name
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingNameEntryId(null)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto rounded-b-lg border border-slate-200 md:rounded-b-xl md:-mx-4 md:-mb-4">
                  <table className="w-full min-w-[900px] border-collapse text-center text-xs">
                    <thead className="bg-slate-100 font-semibold text-slate-800">
                      <tr>
                        <th className="border border-slate-300 px-1 md:px-2 py-1 md:py-2">S No</th>
                        <th className="border border-slate-300 px-1 md:px-2 py-1 md:py-2">Customer Name</th>
                        <th className="border border-slate-300 px-1 md:px-2 py-1 md:py-2">Shift</th>
                        {Array.from({ length: effectiveDayCount }, (_, dayIndex) => (
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
                          <tr key={row.serialNumber} className="bg-white">
                            {nameSpan > 0 && (
                              <td rowSpan={nameSpan} className="border border-slate-200 px-1 md:px-2 py-1 md:py-1 font-semibold align-middle" style={{ verticalAlign: "middle" }}>{displaySerialNumbers[index]}</td>
                            )}
                            {nameSpan > 0 && (
                              <td rowSpan={nameSpan} className="border border-slate-200 px-1 md:px-2 py-1 md:py-1 text-left align-middle">{row.customerName}</td>
                            )}
                            <td className="border border-slate-200 px-1 md:px-2 py-1 md:py-1">{row.shift || "—"}</td>
                            {row.days.slice(0, effectiveDayCount).map((dayValue, dayIndex) => (
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
                </>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

export default History;
