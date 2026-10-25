import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import Layout from "../components/Layout";
import { saveFile } from "../utils/nativeFiles";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  deleteUserByEmail,
  fetchAllUserProfiles,
  isOwnerLoggedIn,
  requestPasswordReset,
  subscribeAuthState,
  updateUserProfileByEmail
} from "../firebase/auth";
import {
  archiveSheetByEmail,
  getCustomersByEmail,
  getHistoryByEmail,
  getSheetByEmail,
  saveCustomersByEmail,
  saveHistoryByEmail,
  saveSheetByEmail,
  type Customer,
  type SheetHistoryEntry,
  type SheetState
} from "../firebase/data";

function evaluateDayInput(rawValue: string): number {
  const parts = rawValue.split("+");
  const sum = parts.reduce((total, part) => {
    const parsed = Number(part.trim());
    return total + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);

  return sum >= 0 ? sum : 0;
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  } catch {
    return value;
  }
}

function getUserInitials(name?: string, email?: string): string {
  const target = (name || "").trim() || (email || "").split("@")[0] || "U";
  const parts = target.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return target.slice(0, 2).toUpperCase();
}

const AVATAR_BG_CLASSES = [
  "bg-blue-600 text-white",
  "bg-emerald-600 text-white",
  "bg-violet-600 text-white",
  "bg-amber-600 text-white",
  "bg-rose-600 text-white",
  "bg-indigo-600 text-white"
];

function getAvatarBg(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_BG_CLASSES[Math.abs(hash) % AVATAR_BG_CLASSES.length];
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

async function downloadSheetAsPdf(entry: SheetHistoryEntry, sheetNumber: number, _ownerLabel?: string) {
  const blob = buildSheetPdfBlob(entry, sheetNumber);
  await saveFile(
    blob,
    `${(entry.name || `Sheet ${sheetNumber}`).replace(/[^a-z0-9_-]+/gi, "-")}.pdf`
  );
}

function downloadSheetAsExcel(entry: SheetHistoryEntry, sheetNumber: number, _ownerLabel?: string) {
  const effectiveDayCount = getEffectiveDayCount(entry);
  void (async () => {
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

type UserProfile = {
  email: string;
  name: string;
  phone: string;
  role: string;
  avatarUrl?: string;
  farmName?: string;
  updatedAt?: string;
};

type UserSnapshot = UserProfile & {
  customers: Customer[];
  sheet: SheetState;
  customerCount: number;
  sheetRowCount: number;
  sheetTotal: number;
};

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

function buildDisplaySerialMap(rows: { customerName: string; serialNumber: number }[]): string[] {
  const serialByCustomer = new Map<string, number>();
  let nextSerial = 1;

  return rows.map((row) => {
    const key = row.customerName.trim().toLowerCase();
    if (!key) return String(row.serialNumber);
    if (serialByCustomer.has(key)) return "";
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
  groupStartIndices.forEach((start) => {
    groupSizes[start] += 1;
  });

  return groupStartIndices.map((start, index) => (start === index ? groupSizes[start] : 0));
}

function buildCombinedTotals(rows: { days: number[] }[], groupStartIndices: number[]): number[] {
  const totals = rows.map((row) => row.days.reduce((sum, value) => sum + value, 0));
  const groupSums = new Array(rows.length).fill(0);
  groupStartIndices.forEach((start, index) => {
    groupSums[start] += totals[index];
  });

  return groupStartIndices.map((start, index) => (start === index ? groupSums[start] : 0));
}

export default function OwnerDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userSnapshots, setUserSnapshots] = useState<UserSnapshot[]>([]);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [selectedUserEmail, setSelectedUserEmail] = useState<string | null>(() => searchParams.get("user"));
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [pwResetMsg, setPwResetMsg] = useState<string | null>(null);
  const [pwResetLoading, setPwResetLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deleteInfo, setDeleteInfo] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveMsg, setArchiveMsg] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(() => searchParams.get("history") === "1");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<SheetHistoryEntry[]>([]);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(() => searchParams.get("sheet"));
  const [openSaveMenuId, setOpenSaveMenuId] = useState<string | null>(null);
  const [editingHistoryNameId, setEditingHistoryNameId] = useState<string | null>(null);
  const [historyNameDraft, setHistoryNameDraft] = useState("");

  // Live Sheet Editing State
  const [isEditingSheet, setIsEditingSheet] = useState(false);
  const [editingSheetState, setEditingSheetState] = useState<SheetState | null>(null);
  const [isSavingSheet, setIsSavingSheet] = useState(false);
  const [sheetSaveMsg, setSheetSaveMsg] = useState<string | null>(null);
  const [focusedDayCell, setFocusedDayCell] = useState<{
    rowIndex: number;
    dayIndex: number;
    text: string;
  } | null>(null);
  const isEditingSheetRef = useRef(false);
  const sheetSaveTimerRef = useRef<number | null>(null);

  // History Sheet Editing State
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editingHistoryState, setEditingHistoryState] = useState<SheetHistoryEntry | null>(null);
  const [isSavingHistory, setIsSavingHistory] = useState(false);
  const [historySaveMsg, setHistorySaveMsg] = useState<string | null>(null);
  const [focusedHistoryDayCell, setFocusedHistoryDayCell] = useState<{
    rowIndex: number;
    dayIndex: number;
    text: string;
  } | null>(null);
  const isEditingHistoryRef = useRef(false);
  const historySaveTimerRef = useRef<number | null>(null);
  const pwResetTimerRef = useRef<number | null>(null);

  // Customer Edit & Filter State
  const [editingCustomerData, setEditingCustomerData] = useState<{
    originalName: string;
    name: string;
    mobile: string;
    address: string;
    shift: "M/E" | "M" | "E";
  } | null>(null);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [customerSaveMsg, setCustomerSaveMsg] = useState<string | null>(null);
  const [customerShiftFilter, setCustomerShiftFilter] = useState<"all" | "both" | "morning" | "evening">("all");

  useEffect(() => {
    isEditingSheetRef.current = isEditingSheet;
  }, [isEditingSheet]);

  useEffect(() => {
    isEditingHistoryRef.current = !!editingHistoryId;
  }, [editingHistoryId]);

  useEffect(() => {
    return () => {
      if (sheetSaveTimerRef.current) {
        window.clearTimeout(sheetSaveTimerRef.current);
      }
      if (historySaveTimerRef.current) {
        window.clearTimeout(historySaveTimerRef.current);
      }
      if (pwResetTimerRef.current) {
        window.clearTimeout(pwResetTimerRef.current);
      }
    };
  }, []);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "idle">("all");
  const [activeTab, setActiveTab] = useState<"sheet" | "customers" | "history" | "account">(() =>
    searchParams.get("history") === "1" ? "history" : "sheet"
  );

  useEffect(() => {
    const nextParams = new URLSearchParams();
    if (selectedUserEmail) {
      nextParams.set("user", selectedUserEmail);
    }
    if (activeTab === "history" || showHistory) {
      nextParams.set("history", "1");
    }
    if (expandedEntryId) {
      nextParams.set("sheet", expandedEntryId);
    }
    setSearchParams(nextParams, { replace: true });
  }, [selectedUserEmail, activeTab, showHistory, expandedEntryId, setSearchParams]);

  useEffect(() => {
    if (!isOwnerLoggedIn()) {
      navigate("/login");
      return;
    }

    void loadDashboardData(true);

    const interval = setInterval(() => {
      if (!isEditingSheetRef.current) {
        void loadDashboardData(false);
      }
    }, 3000);

    const unsubscribe = subscribeAuthState(() => {
      if (!isEditingSheetRef.current) {
        void loadDashboardData(false);
      }
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [navigate]);

  const loadDashboardData = async (showGlobalLoading = false) => {
    if (isEditingSheetRef.current) return;
    if (showGlobalLoading || userSnapshots.length === 0) {
      setLoading(true);
    }
    setDeleteInfo("");
    setLoadError(null);

    try {
      const userProfiles = await fetchAllUserProfiles(true);
      const snapshots = await Promise.all(
        userProfiles.map(async (profile) => {
          const [customers, sheet] = await Promise.all([
            getCustomersByEmail(profile.email, true),
            getSheetByEmail(profile.email, true)
          ]);

          const sheetTotal = sheet.rows.reduce(
            (sum, row) => sum + row.days.reduce((rowSum, value) => rowSum + (value || 0), 0),
            0
          );

          const uniqueCustomers = new Set(
            customers.filter((c) => c.name.trim()).map((c) => c.name.trim().toLowerCase())
          ).size;

          return {
            ...profile,
            customers,
            sheet,
            customerCount: uniqueCustomers,
            sheetRowCount: sheet.rows.filter((row) => row.customerName.trim() || row.shift.trim()).length,
            sheetTotal
          };
        })
      );

      setUsers(userProfiles);
      setUserSnapshots(snapshots);
      setTotalEarnings(snapshots.reduce((sum, snapshot) => sum + snapshot.sheetTotal, 0));
    } catch (error) {
      console.error("Error loading dashboard data:", error);
      setLoadError(error instanceof Error ? error.message : "Could not load dashboard data.");
      setUsers([]);
      setUserSnapshots([]);
      setTotalEarnings(0);
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadDashboardData();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const handleDeleteUser = async (email: string) => {
    if (loading) return;

    setLoading(true);
    try {
      await deleteUserByEmail(email);
      setDeleteConfirm(null);
      setDeleteInfo("");
      await loadDashboardData();
    } catch (error) {
      setDeleteInfo(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveToHistory = async (email: string, sheet: SheetState) => {
    if (archiving) return;

    if (sheet.rows.every((row) => !row.customerName.trim() && row.days.every((value) => !value))) {
      setArchiveMsg("This user's sheet is empty — nothing to save.");
      return;
    }

    const sheetName = window.prompt("Enter a name for this sheet before saving to history:", "");
    if (sheetName === null) {
      return;
    }

    if (!window.confirm(`Save ${email}'s current sheet to history and reset it for a new period?`)) {
      return;
    }

    setArchiving(true);
    setArchiveMsg(null);
    try {
      await archiveSheetByEmail(email, sheet, sheetName);
      await loadDashboardData();
      if (activeTab === "history" || showHistory) {
        setHistoryEntries(await getHistoryByEmail(email));
      }
      setArchiveMsg("Sheet saved to history and reset successfully.");
    } catch (error) {
      setArchiveMsg(error instanceof Error ? error.message : "Failed to save to history.");
    } finally {
      setArchiving(false);
    }
  };

  const handleLoadHistory = async (email: string) => {
    setHistoryLoading(true);
    try {
      const entries = await getHistoryByEmail(email);
      setHistoryEntries(entries);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDeleteHistoryEntry = async (email: string, entryId: string) => {
    if (!window.confirm("Delete this saved sheet? This cannot be undone.")) {
      return;
    }

    const nextEntries = historyEntries.filter((entry) => entry.id !== entryId);
    setHistoryEntries(nextEntries);
    if (expandedEntryId === entryId) {
      setExpandedEntryId(null);
    }
    await saveHistoryByEmail(email, nextEntries);
  };

  const handleRenameHistoryEntry = async (email: string, entryId: string, newName: string) => {
    const nextEntries = historyEntries.map((entry) =>
      entry.id === entryId ? { ...entry, name: newName.trim() } : entry
    );
    setHistoryEntries(nextEntries);
    await saveHistoryByEmail(email, nextEntries);
    setEditingHistoryNameId(null);
  };

  const selectedUser = userSnapshots.find((snapshot) => snapshot.email === selectedUserEmail) ?? null;

  const handleSaveLiveSheet = async () => {
    if (!selectedUser) return;
    const sheetToSave = isEditingSheet && editingSheetState ? editingSheetState : selectedUser.sheet;
    setIsSavingSheet(true);
    if (sheetSaveTimerRef.current) {
      window.clearTimeout(sheetSaveTimerRef.current);
      sheetSaveTimerRef.current = null;
    }
    setSheetSaveMsg(null);
    try {
      await saveSheetByEmail(selectedUser.email, sheetToSave);
      setSheetSaveMsg("Live sheet saved successfully!");
      sheetSaveTimerRef.current = window.setTimeout(() => {
        setSheetSaveMsg(null);
        sheetSaveTimerRef.current = null;
      }, 5000);

      setIsEditingSheet(false);
      setEditingSheetState(null);
      setFocusedDayCell(null);
      isEditingSheetRef.current = false;
      await loadDashboardData();
    } catch (error) {
      setSheetSaveMsg(error instanceof Error ? error.message : "Failed to save sheet.");
      sheetSaveTimerRef.current = window.setTimeout(() => {
        setSheetSaveMsg(null);
        sheetSaveTimerRef.current = null;
      }, 5000);
    } finally {
      setIsSavingSheet(false);
    }
  };

  const handleDayCellChange = (rowIndex: number, dayIndex: number, rawValue: string) => {
    if (!editingSheetState) return;
    const numValue = evaluateDayInput(rawValue);
    const nextRows = editingSheetState.rows.map((row, rIdx) => {
      if (rIdx !== rowIndex) return row;
      const nextDays = [...row.days];
      nextDays[dayIndex] = numValue;
      return { ...row, days: nextDays };
    });
    setEditingSheetState({
      ...editingSheetState,
      rows: nextRows
    });
  };

  const handleSaveHistorySheet = async (entryId: string) => {
    if (!selectedUser || !editingHistoryState) return;
    setIsSavingHistory(true);
    if (historySaveTimerRef.current) {
      window.clearTimeout(historySaveTimerRef.current);
      historySaveTimerRef.current = null;
    }
    setHistorySaveMsg(null);
    try {
      const updatedEntries = historyEntries.map((h) =>
        h.id === entryId ? { ...editingHistoryState, updatedAt: new Date().toISOString() } : h
      );
      setHistoryEntries(updatedEntries);
      await saveHistoryByEmail(selectedUser.email, updatedEntries);
      setHistorySaveMsg("History sheet saved successfully!");
      historySaveTimerRef.current = window.setTimeout(() => {
        setHistorySaveMsg(null);
        historySaveTimerRef.current = null;
      }, 5000);

      setEditingHistoryId(null);
      setEditingHistoryState(null);
      setFocusedHistoryDayCell(null);
      isEditingHistoryRef.current = false;
    } catch (error) {
      setHistorySaveMsg(error instanceof Error ? error.message : "Failed to save history sheet.");
      historySaveTimerRef.current = window.setTimeout(() => {
        setHistorySaveMsg(null);
        historySaveTimerRef.current = null;
      }, 5000);
    } finally {
      setIsSavingHistory(false);
    }
  };

  const handleHistoryDayCellChange = (rowIndex: number, dayIndex: number, rawValue: string) => {
    if (!editingHistoryState) return;
    const numValue = evaluateDayInput(rawValue);
    const nextRows = editingHistoryState.rows.map((row, rIdx) => {
      if (rIdx !== rowIndex) return row;
      const nextDays = [...row.days];
      nextDays[dayIndex] = numValue;
      return { ...row, days: nextDays };
    });
    setEditingHistoryState({
      ...editingHistoryState,
      rows: nextRows
    });
  };

  const handleSaveCustomerDetails = async () => {
    if (!selectedUser || !editingCustomerData) return;
    const newName = editingCustomerData.name.trim();
    if (!newName) {
      setCustomerSaveMsg("Customer name cannot be empty.");
      return;
    }

    setIsSavingCustomer(true);
    setCustomerSaveMsg(null);

    try {
      const oldName = editingCustomerData.originalName.trim().toLowerCase();
      const otherCustomers = selectedUser.customers.filter(
        (c) => c.name.trim().toLowerCase() !== oldName
      );

      const newRecords: Customer[] = [];
      if (editingCustomerData.shift === "M/E") {
        newRecords.push({
          serialNumber: 0,
          name: newName,
          mobile: editingCustomerData.mobile.trim(),
          address: editingCustomerData.address.trim(),
          shift: "M",
          createdAt: new Date().toISOString()
        });
        newRecords.push({
          serialNumber: 0,
          name: newName,
          mobile: editingCustomerData.mobile.trim(),
          address: editingCustomerData.address.trim(),
          shift: "E",
          createdAt: new Date().toISOString()
        });
      } else {
        newRecords.push({
          serialNumber: 0,
          name: newName,
          mobile: editingCustomerData.mobile.trim(),
          address: editingCustomerData.address.trim(),
          shift: editingCustomerData.shift,
          createdAt: new Date().toISOString()
        });
      }

      const updatedCustomerList = [...otherCustomers, ...newRecords];
      await saveCustomersByEmail(selectedUser.email, updatedCustomerList);

      // If customer name changed, update live sheet rows
      if (editingCustomerData.originalName.trim() !== newName) {
        const nextSheetRows = selectedUser.sheet.rows.map((row) => {
          if (row.customerName.trim().toLowerCase() === oldName) {
            return { ...row, customerName: newName };
          }
          return row;
        });
        await saveSheetByEmail(selectedUser.email, {
          ...selectedUser.sheet,
          rows: nextSheetRows
        });
      }

      await loadDashboardData();
      setCustomerSaveMsg("Customer details updated successfully!");
      setTimeout(() => {
        setEditingCustomerData(null);
        setCustomerSaveMsg(null);
      }, 900);
    } catch (err) {
      setCustomerSaveMsg(err instanceof Error ? err.message : "Failed to update customer.");
    } finally {
      setIsSavingCustomer(false);
    }
  };

  useEffect(() => {
    if (!selectedUser) return;
    setEditName(selectedUser.name || "");
    setEditPhone(selectedUser.phone || "");
    setEditEmail(selectedUser.email || "");
    setSaveMessage(null);
    setPwResetMsg(null);
    if (pwResetTimerRef.current) {
      window.clearTimeout(pwResetTimerRef.current);
      pwResetTimerRef.current = null;
    }
    setArchiveMsg(null);
    setIsEditingSheet(false);
    setEditingSheetState(null);
    if (sheetSaveTimerRef.current) {
      window.clearTimeout(sheetSaveTimerRef.current);
      sheetSaveTimerRef.current = null;
    }
    setSheetSaveMsg(null);
    setFocusedDayCell(null);
    setEditingHistoryId(null);
    setEditingHistoryState(null);
    setHistorySaveMsg(null);
    setFocusedHistoryDayCell(null);
    if (historySaveTimerRef.current) {
      window.clearTimeout(historySaveTimerRef.current);
      historySaveTimerRef.current = null;
    }
    setHistoryEntries([]);
    void handleLoadHistory(selectedUser.email);
  }, [selectedUserEmail]);

  useEffect(() => {
    if (!selectedUserEmail) return;

    let cancelled = false;

    const refreshSelectedUserData = async () => {
      if (isEditingSheetRef.current || isEditingHistoryRef.current) return;
      if (activeTab === "history") {
        const nextHistory = await getHistoryByEmail(selectedUserEmail);
        if (!cancelled) {
          setHistoryEntries(nextHistory);
        }
        return;
      }

      await loadDashboardData();
    };

    void refreshSelectedUserData();
    const interval = window.setInterval(() => {
      void refreshSelectedUserData();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [selectedUserEmail, activeTab]);

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return userSnapshots.filter((user) => {
      if (!q) return true;
      const matchName = user.name?.toLowerCase().includes(q);
      const matchFarm = user.farmName?.toLowerCase().includes(q);
      const matchEmail = user.email?.toLowerCase().includes(q);
      const matchPhone = user.phone?.includes(q);
      return Boolean(matchName || matchFarm || matchEmail || matchPhone);
    });
  }, [userSnapshots, searchQuery]);

  const totalCustomersCount = userSnapshots.reduce((sum, s) => sum + s.customerCount, 0);

  return (
    <Layout hideBottomNav>
      <div className="min-h-screen p-3 md:px-0 md:pt-1 md:pb-20">
        
        {/* Header Section */}
        <div className="mb-4 md:mb-5 space-y-1">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Executive Dashboard
            </h1>
            <button
              type="button"
              onClick={() => { void handleManualRefresh(); }}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-700 active:scale-95 transition cursor-pointer"
            >
              <span className={isRefreshing ? "animate-spin" : ""}>🔄</span>
              <span>Sync Live</span>
            </button>
          </div>
          <p className="hidden sm:block text-xs md:text-sm text-slate-500 dark:text-slate-400">
            Real-time oversight across all dairy accounts, milk collection sheets & history
          </p>
        </div>

        {/* Global Notifications / Alerts */}
        {deleteInfo ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs md:text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            {deleteInfo}
          </div>
        ) : null}
        {loadError ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs md:text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
            {loadError}
          </div>
        ) : null}

        {/* 1. EXECUTIVE KPI STAT CARDS */}
        <section className="mb-6">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            {/* Total Revenue */}
            <div className="flex flex-col justify-between min-h-[96px] sm:min-h-[110px] rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/70 to-white p-3.5 sm:p-4 shadow-xs dark:border-violet-900/40 dark:from-violet-950/20 dark:to-[#1c1c1c]">
              <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-violet-600/10 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400 font-bold text-base">
                ₹
              </span>
              <div className="mt-2.5 sm:mt-3">
                <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Revenue</p>
                <p className="font-mono text-lg sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5">
                  ₹{totalEarnings.toLocaleString("en-IN")}
                </p>
              </div>
            </div>

            {/* Total Accounts */}
            <div className="flex flex-col justify-between min-h-[96px] sm:min-h-[110px] rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/70 to-white p-3.5 sm:p-4 shadow-xs dark:border-blue-900/40 dark:from-blue-950/20 dark:to-[#1c1c1c]">
              <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-blue-600/10 text-brand-600 dark:bg-blue-500/20 dark:text-blue-400 font-bold text-base">
                🏢
              </span>
              <div className="mt-2.5 sm:mt-3">
                <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Dairy Accounts</p>
                <p className="font-mono text-lg sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5">
                  {users.length} {users.length === 1 ? "User" : ""}
                </p>
              </div>
            </div>

            {/* Customer Reach */}
            <div className="flex flex-col justify-between min-h-[96px] sm:min-h-[110px] rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 to-white p-3.5 sm:p-4 shadow-xs dark:border-emerald-900/40 dark:from-emerald-950/20 dark:to-[#1c1c1c]">
              <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 font-bold text-base">
                🧑‍🌾
              </span>
              <div className="mt-2.5 sm:mt-3">
                <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Customers</p>
                <p className="font-mono text-lg sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5">
                  {totalCustomersCount}
                </p>
              </div>
            </div>

            {/* Active Sheets */}
            <div className="flex flex-col justify-between min-h-[96px] sm:min-h-[110px] rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/70 to-white p-3.5 sm:p-4 shadow-xs dark:border-amber-900/40 dark:from-amber-950/20 dark:to-[#1c1c1c]">
              <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-amber-600/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 font-bold text-base">
                📊
              </span>
              <div className="mt-2.5 sm:mt-3">
                <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Active Sheets</p>
                <p className="font-mono text-lg sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5">
                  {userSnapshots.filter((s) => s.sheetRowCount > 0).length}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 2. USER DIRECTORY & MANAGEMENT CARD */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-[#333] dark:bg-[#1e1e1e] overflow-hidden">
          
          {/* Card Top: Title & Search */}
          <div className="border-b border-slate-100 p-4 md:p-5 dark:border-[#333] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>👥</span> Dairy Accounts Directory
                </h2>
                <p className="hidden sm:block text-xs text-slate-500 dark:text-slate-400">
                  Monitor live collections, inspect customer lists and reset credentials
                </p>
              </div>
              <span className="hidden sm:inline text-xs font-semibold text-slate-500 dark:text-slate-400">
                Showing <strong className="text-slate-900 dark:text-white">{filteredUsers.length}</strong> of {users.length} accounts
              </span>
            </div>

            {/* Search Input */}
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by dairy name, owner email or phone..."
                className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-8 text-xs md:text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 dark:border-[#444] dark:bg-[#161616] dark:text-white transition"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs p-1"
                >
                  ✕
                </button>
              ) : null}
            </div>
          </div>

          {/* Empty / Loading States */}
          {loading && userSnapshots.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              <div className="mx-auto mb-2 h-7 w-7 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
              Loading dairy accounts...
            </div>
          ) : null}

          {userSnapshots.length === 0 && !loading ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No users registered yet. Accounts will appear here once registered.
            </div>
          ) : null}

          {filteredUsers.length === 0 && userSnapshots.length > 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No accounts match &ldquo;{searchQuery}&rdquo;. Try another search term.
            </div>
          ) : null}

          {/* DESKTOP TABLE VIEW */}
          {filteredUsers.length > 0 && (
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-[#333] dark:bg-[#171717] dark:text-slate-400">
                  <tr>
                    <th className="px-5 py-3.5">User</th>
                    <th className="px-4 py-3.5">Contact</th>
                    <th className="px-4 py-3.5 text-center">Customers</th>
                    <th className="px-4 py-3.5 text-right">Total</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2a2a2a]">
                  {filteredUsers.map((user) => {
                    return (
                      <tr key={user.email} className="hover:bg-slate-50/80 dark:hover:bg-[#222]/80 transition">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold text-xs shadow-xs ${getAvatarBg(user.email)}`}>
                              {getUserInitials(user.name, user.email)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 dark:text-white text-sm truncate">
                                {user.farmName || user.name || "Dairy Account"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-xs">
                          <p className="font-medium text-slate-900 dark:text-white truncate">
                            {user.email}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {user.phone || "-"}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-bold text-brand-600 dark:bg-blue-500/20 dark:text-blue-400">
                            {user.customerCount}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                            ₹{user.sheetTotal.toLocaleString("en-IN")}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedUserEmail(user.email);
                                setActiveTab("sheet");
                              }}
                              className="flex items-center gap-1 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-brand-700 hover:bg-blue-100 active:scale-95 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50 transition cursor-pointer"
                            >
                              <span>👁️</span> Inspect
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirm(user.email)}
                              className="rounded-xl border border-slate-200 p-1.5 text-slate-400 hover:text-rose-600 hover:border-rose-300 dark:border-[#333] dark:hover:border-rose-900 transition cursor-pointer"
                              title="Delete Account"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* MOBILE CARDS VIEW */}
          {filteredUsers.length > 0 && (
            <div className="md:hidden divide-y divide-slate-100 dark:divide-[#2a2a2a] p-3 space-y-3">
              {filteredUsers.map((user) => {
                return (
                  <div key={user.email} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-[#333] dark:bg-[#1a1a1a] space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold text-xs ${getAvatarBg(user.email)}`}>
                          {getUserInitials(user.name, user.email)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-slate-900 dark:text-white truncate">
                            {user.farmName || user.name || "Dairy Account"}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2.5 text-xs dark:bg-[#141414]">
                      <div>
                        <span className="text-slate-400">Customers:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 ml-1">{user.customerCount}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400">Total:</span>
                        <span className="font-mono font-bold text-slate-900 dark:text-white ml-1">
                          ₹{user.sheetTotal.toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUserEmail(user.email);
                          setActiveTab("sheet");
                        }}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-700 active:scale-95 transition cursor-pointer"
                      >
                        <span>👁️</span> Inspect 
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(user.email)}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 active:scale-95 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300 transition cursor-pointer"
                      >
                        <span>🗑️</span> Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* DELETE CONFIRMATION MODAL */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 md:p-6 shadow-2xl dark:border dark:border-[#333] dark:bg-[#212121]">
              <div className="flex items-center gap-3 mb-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 font-bold">
                  ⚠️
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete User Account</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Irreversible administrative action</p>
                </div>
              </div>
              <p className="mb-5 text-xs md:text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Are you sure you want to permanently delete <strong>{deleteConfirm}</strong>? All their customers, sheets, and historical data will be removed.
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  disabled={loading}
                  className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-95 disabled:opacity-50 dark:border-[#444] dark:bg-[#1c1c1c] dark:text-slate-200 dark:hover:bg-[#282828] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { void handleDeleteUser(deleteConfirm); }}
                  disabled={loading}
                  className="min-h-11 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 active:scale-95 disabled:opacity-50 shadow-sm cursor-pointer"
                >
                  {loading ? "Deleting..." : "Delete Permanently"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3. USER INSPECTION FULL SCREEN VIEW */}
        {selectedUser && (
          <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-[#1c1c1c] w-full h-full overflow-hidden animate-in fade-in duration-150">
            
            {/* Top Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-4 py-3 sm:px-6 dark:border-[#333] dark:bg-[#202020] shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-2xl font-black text-sm shadow-xs ${getAvatarBg(selectedUser.email)}`}>
                  {getUserInitials(selectedUser.name, selectedUser.email)}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                    {selectedUser.farmName || selectedUser.name || "Dairy Account"}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {selectedUser.email} {selectedUser.phone ? `· ${selectedUser.phone}` : ""}
                  </p>
                </div>
              </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedUserEmail(null)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-rose-600 hover:bg-rose-200 active:scale-95 transition dark:bg-rose-950/50 dark:text-rose-400 dark:hover:bg-rose-900/60 dark:border dark:border-rose-900/50 cursor-pointer font-bold"
                    aria-label="Close user data dialog"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Segmented Navigation Tabs */}
              <div className="border-b border-slate-200 bg-white px-3 sm:px-6 dark:border-[#333] dark:bg-[#1e1e1e]">
                <nav className="flex gap-1.5 sm:gap-2 overflow-x-auto py-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("sheet")}
                    className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                      activeTab === "sheet"
                        ? "bg-brand-50 text-brand-700 dark:bg-blue-950/50 dark:text-blue-300 ring-1 ring-brand-500/30"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#252525]"
                    }`}
                  >
                    <span>📊</span>
                    <span>Live Sheet Data</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("customers")}
                    className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                      activeTab === "customers"
                        ? "bg-brand-50 text-brand-700 dark:bg-blue-950/50 dark:text-blue-300 ring-1 ring-brand-500/30"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#252525]"
                    }`}
                  >
                    <span>🧑‍🌾</span>
                    <span>Customer Directory ({selectedUser.customerCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("history");
                      void handleLoadHistory(selectedUser.email);
                    }}
                    className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                      activeTab === "history"
                        ? "bg-brand-50 text-brand-700 dark:bg-blue-950/50 dark:text-blue-300 ring-1 ring-brand-500/30"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#252525]"
                    }`}
                  >
                    <span>📁</span>
                    <span>Sheet History ({historyEntries.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("account")}
                    className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                      activeTab === "account"
                        ? "bg-brand-50 text-brand-700 dark:bg-blue-950/50 dark:text-blue-300 ring-1 ring-brand-500/30"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#252525]"
                    }`}
                  >
                    <span>⚙️</span>
                    <span>Edit & Security</span>
                  </button>
                </nav>
              </div>

              {/* Drawer Content Area */}
              <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 bg-slate-50/60 dark:bg-[#161616]">

                {/* TAB 1: LIVE SHEET DATA */}
                {activeTab === "sheet" && (() => {
                  const activeSheet = isEditingSheet && editingSheetState ? editingSheetState : selectedUser.sheet;
                  const activeSheetTotal = activeSheet.rows.reduce(
                    (sum, row) => sum + row.days.reduce((rowSum, value) => rowSum + (value || 0), 0),
                    0
                  );

                  return (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#333] dark:bg-[#212121]">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Active Milk Collection Sheet</h4>
                            {isEditingSheet && (
                              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                                Editing Mode
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {getCustomerCount(activeSheet.rows)} Customers · {activeSheet.dayCount} Days · Total ₹{activeSheetTotal.toLocaleString("en-IN")}
                          </p>
                        </div>

                        <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto">

                          {/* Edit Sheet Button */}
                          <button
                            type="button"
                            onClick={() => {
                              if (isEditingSheet) {
                                setIsEditingSheet(false);
                                setEditingSheetState(null);
                                setFocusedDayCell(null);
                              } else {
                                setIsEditingSheet(true);
                                setEditingSheetState(JSON.parse(JSON.stringify(selectedUser.sheet)));
                                if (sheetSaveTimerRef.current) {
                                  window.clearTimeout(sheetSaveTimerRef.current);
                                  sheetSaveTimerRef.current = null;
                                }
                                setSheetSaveMsg(null);
                              }
                            }}
                            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer shrink-0 ${
                              isEditingSheet
                                ? "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-300"
                                : "border border-blue-200 bg-blue-50 text-brand-700 hover:bg-blue-100 dark:border-blue-800/50 dark:bg-blue-950/40 dark:text-blue-300"
                            }`}
                          >
                            {isEditingSheet ? "✕ Cancel Edit" : "✏️ Edit Sheet"}
                          </button>

                          {/* Save Sheet Button - only shown when in Edit Sheet mode */}
                          {isEditingSheet && (
                            <button
                              type="button"
                              onClick={() => void handleSaveLiveSheet()}
                              disabled={isSavingSheet}
                              className="rounded-xl border border-emerald-500 bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition cursor-pointer shrink-0 ml-auto sm:ml-0"
                            >
                              {isSavingSheet ? "Saving..." : "💾 Save Sheet"}
                            </button>
                          )}

                          {/* Save to History - shown only when not editing, styled in green like Edit Sheet */}
                          {!isEditingSheet && (
                            <button
                              type="button"
                              onClick={() => { void handleArchiveToHistory(selectedUser.email, activeSheet); }}
                              disabled={archiving}
                              className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300 cursor-pointer transition shrink-0 ml-auto sm:ml-0"
                            >
                              {archiving ? "Saving..." : "📁 Save to History"}
                            </button>
                          )}
                        </div>
                      </div>

                      {sheetSaveMsg && (
                        <p className={`text-xs font-medium p-2.5 rounded-xl border ${
                          sheetSaveMsg.includes("success")
                            ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50/70 border-emerald-200 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                            : "text-rose-600 dark:text-rose-400 bg-rose-50/70 border-rose-200 dark:border-rose-900/40 dark:bg-rose-950/20"
                        }`}>
                          {sheetSaveMsg}
                        </p>
                      )}

                      {archiveMsg && (
                        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                          {archiveMsg}
                        </p>
                      )}

                      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-[#333] dark:bg-[#212121]">
                        <table className="min-w-[900px] w-full border-collapse text-center text-xs">
                          <thead className="bg-slate-100 font-bold text-slate-800 dark:bg-[#262626] dark:text-slate-200 border-b border-slate-200 dark:border-[#333]">
                            <tr>
                              <th className="border border-slate-300 px-2 py-2.5 dark:border-[#444] w-12">S No</th>
                              <th className="border border-slate-300 px-3 py-2.5 text-left dark:border-[#444] min-w-[160px]">Customer Name</th>
                              <th className="border border-slate-300 px-2 py-2.5 dark:border-[#444] w-14">Shift</th>
                              {Array.from({ length: activeSheet.dayCount }, (_, index) => (
                                <th key={`selected-day-${index + 1}`} className="border border-slate-300 px-1 py-2.5 dark:border-[#444] min-w-[38px]">
                                  D{index + 1}
                                </th>
                              ))}
                              <th className="border border-slate-300 px-3 py-2.5 font-bold text-right dark:border-[#444] min-w-[70px]">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const effectiveDayCount = activeSheet.dayCount;
                              const displaySerials = buildDisplaySerialMap(activeSheet.rows);
                              const groupStartIndices = buildGroupStartIndices(activeSheet.rows);
                              const nameCellSpans = buildNameCellSpans(groupStartIndices);
                              const combinedTotals = buildCombinedTotals(activeSheet.rows, groupStartIndices);
                              return activeSheet.rows.map((row, rowIndex) => {
                                const rowTotal = row.days.reduce((sum, value) => sum + value, 0);
                                const nameSpan = nameCellSpans[rowIndex];
                                const displayTotal = nameSpan > 1 ? combinedTotals[rowIndex] : rowTotal;

                                return (
                                  <tr key={`${selectedUser.email}-sheet-${row.serialNumber}-${rowIndex}`} className="bg-white hover:bg-slate-50 dark:bg-[#1c1c1c] dark:hover:bg-[#222] dark:text-slate-200">
                                    {nameSpan > 0 && (
                                      <td rowSpan={nameSpan} className="border border-slate-200 px-1 py-1 font-semibold align-middle dark:border-[#333]" style={{ verticalAlign: "middle" }}>
                                        {displaySerials[rowIndex]}
                                      </td>
                                    )}
                                    {nameSpan > 0 && (
                                      <td rowSpan={nameSpan} className="border border-slate-200 px-2.5 py-1 text-left font-bold align-middle dark:border-[#333]" style={{ verticalAlign: "middle" }}>
                                        {row.customerName || `Customer ${displaySerials[rowIndex] || row.serialNumber}`}
                                      </td>
                                    )}
                                    <td className="border border-slate-200 px-1 py-1 dark:border-[#333]">
                                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                        row.shift === "M"
                                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                          : row.shift === "E"
                                          ? "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300"
                                          : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300"
                                      }`}>
                                        {row.shift || "-"}
                                      </span>
                                    </td>
                                    {row.days.slice(0, effectiveDayCount).map((value, dayIndex) => (
                                      <td key={`${selectedUser.email}-${row.serialNumber}-${dayIndex + 1}`} className={`border border-slate-200 font-mono dark:border-[#333] ${isEditingSheet ? "p-0.5 bg-blue-50/20 dark:bg-blue-950/20" : "px-1 py-1"}`}>
                                        {isEditingSheet ? (
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            value={
                                              focusedDayCell && focusedDayCell.rowIndex === rowIndex && focusedDayCell.dayIndex === dayIndex
                                                ? focusedDayCell.text
                                                : value === 0
                                                ? ""
                                                : String(value)
                                            }
                                            onFocus={() => {
                                              setFocusedDayCell({
                                                rowIndex,
                                                dayIndex,
                                                text: value === 0 ? "" : String(value)
                                              });
                                            }}
                                            onChange={(e) => {
                                              const newText = e.target.value;
                                              setFocusedDayCell({ rowIndex, dayIndex, text: newText });
                                              handleDayCellChange(rowIndex, dayIndex, newText);
                                            }}
                                            onBlur={() => {
                                              setFocusedDayCell(null);
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") {
                                                (e.target as HTMLInputElement).blur();
                                              }
                                            }}
                                            className="w-full min-w-[34px] h-7 text-center rounded border border-transparent hover:border-slate-300 focus:border-brand-500 focus:bg-white bg-transparent font-mono text-xs font-bold text-slate-900 outline-none transition dark:text-white dark:hover:border-[#555] dark:focus:bg-[#161616]"
                                          />
                                        ) : (
                                          value === 0 ? "-" : value
                                        )}
                                      </td>
                                    ))}
                                    {nameSpan > 0 && (
                                      <td rowSpan={nameSpan} className="border border-slate-200 px-2.5 py-1 text-right font-mono font-bold text-slate-900 dark:text-white dark:border-[#333]">
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
                })()}

                {/* TAB 2: CUSTOMERS DIRECTORY */}
                {activeTab === "customers" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 dark:border-[#333] dark:bg-[#212121]">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">Customer Directory</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">All registered farmers under this dairy account</p>
                      </div>
                      <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-bold text-brand-600 dark:bg-blue-500/20 dark:text-blue-400">
                        {selectedUser.customers.length} Entries
                      </span>
                    </div>

                    {selectedUser.customers.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 dark:border-[#333] dark:bg-[#212121] dark:text-slate-400">
                        No customers added yet for this account.
                      </div>
                    ) : (
                      (() => {
                        const seen = new Map<string, { customer: typeof selectedUser.customers[0]; shifts: string[] }>();
                        selectedUser.customers.forEach((c) => {
                          const key = c.name.trim().toLowerCase();
                          if (!key) return;
                          if (seen.has(key)) {
                            if (c.shift && !seen.get(key)!.shifts.includes(c.shift)) seen.get(key)!.shifts.push(c.shift);
                          } else {
                            seen.set(key, { customer: c, shifts: c.shift ? [c.shift] : [] });
                          }
                        });

                        const allUnique = Array.from(seen.values());

                        const getCategory = (shifts: string[]): "both" | "morning" | "evening" | "other" => {
                          const hasM = shifts.includes("M") || shifts.some((s) => s.toUpperCase().includes("M"));
                          const hasE = shifts.includes("E") || shifts.some((s) => s.toUpperCase().includes("E"));
                          if (hasM && hasE) return "both";
                          if (hasM) return "morning";
                          if (hasE) return "evening";
                          return "other";
                        };

                        const bothCount = allUnique.filter((item) => getCategory(item.shifts) === "both").length;
                        const morningCount = allUnique.filter((item) => getCategory(item.shifts) === "morning").length;
                        const eveningCount = allUnique.filter((item) => getCategory(item.shifts) === "evening").length;

                        // Sort order: M & E first (0), Morning second (1), Evening third (2), Other fourth (3)
                        const sorted = [...allUnique].sort((a, b) => {
                          const priorityMap = { both: 0, morning: 1, evening: 2, other: 3 };
                          const catA = getCategory(a.shifts);
                          const catB = getCategory(b.shifts);
                          if (priorityMap[catA] !== priorityMap[catB]) {
                            return priorityMap[catA] - priorityMap[catB];
                          }
                          return a.customer.name.localeCompare(b.customer.name);
                        });

                        const filtered = sorted.filter((item) => {
                          if (customerShiftFilter === "all") return true;
                          return getCategory(item.shifts) === customerShiftFilter;
                        });

                        return (
                          <div className="space-y-3">
                            {/* Filter Bar on first row: All, M&E, M, E */}
                            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1">
                              <button
                                type="button"
                                onClick={() => setCustomerShiftFilter("all")}
                                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer shrink-0 ${
                                  customerShiftFilter === "all"
                                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-[#333] dark:bg-[#212121] dark:text-slate-300"
                                }`}
                              >
                                All ({allUnique.length})
                              </button>
                              <button
                                type="button"
                                onClick={() => setCustomerShiftFilter("both")}
                                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
                                  customerShiftFilter === "both"
                                    ? "bg-emerald-600 text-white shadow-xs"
                                    : "border border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                                }`}
                              >
                                <span>M & E</span>
                                <span className="rounded-full bg-black/10 dark:bg-white/10 px-1.5 py-0.2 text-[10px]">{bothCount}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setCustomerShiftFilter("morning")}
                                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
                                  customerShiftFilter === "morning"
                                    ? "bg-amber-600 text-white shadow-xs"
                                    : "border border-amber-200 bg-amber-50/70 text-amber-800 hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300"
                                }`}
                              >
                                <span>Morning (M)</span>
                                <span className="rounded-full bg-black/10 dark:bg-white/10 px-1.5 py-0.2 text-[10px]">{morningCount}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setCustomerShiftFilter("evening")}
                                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
                                  customerShiftFilter === "evening"
                                    ? "bg-violet-600 text-white shadow-xs"
                                    : "border border-violet-200 bg-violet-50/70 text-violet-800 hover:bg-violet-100 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-300"
                                }`}
                              >
                                <span>Evening (E)</span>
                                <span className="rounded-full bg-black/10 dark:bg-white/10 px-1.5 py-0.2 text-[10px]">{eveningCount}</span>
                              </button>
                            </div>

                            {/* Customer Cards Grid (Sorted M&E, then M, then E) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {filtered.map(({ customer, shifts }, idx) => {
                                const cat = getCategory(shifts);
                                return (
                                  <div
                                    key={`${selectedUser.email}-${customer.name}-${idx}`}
                                    onClick={() => {
                                      setEditingCustomerData({
                                        originalName: customer.name,
                                        name: customer.name,
                                        mobile: customer.mobile || "",
                                        address: customer.address || "",
                                        shift: cat === "both" ? "M/E" : cat === "evening" ? "E" : "M"
                                      });
                                      setCustomerSaveMsg(null);
                                    }}
                                    className="group rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs hover:border-blue-400 hover:shadow-md dark:border-[#333] dark:bg-[#212121] dark:hover:border-blue-500 space-y-2 cursor-pointer transition relative"
                                    title="Click to edit customer details"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0 pr-1">
                                        <p className="font-bold text-sm text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition flex items-center gap-1.5">
                                          <span>{customer.name}</span>
                                          <span className="text-[10px] text-blue-500 opacity-0 group-hover:opacity-100 transition font-normal">✏️ Edit</span>
                                        </p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                          📞 {customer.mobile || "No phone"}
                                        </p>
                                      </div>
                                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-blue-950/50 dark:text-blue-300 shrink-0">
                                        #{idx + 1}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[11px] text-slate-500 dark:text-slate-400">Shift:</span>
                                      {cat === "both" ? (
                                        <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                                          M & E
                                        </span>
                                      ) : cat === "morning" ? (
                                        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                                          M
                                        </span>
                                      ) : cat === "evening" ? (
                                        <span className="rounded-md bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800 dark:bg-violet-950/50 dark:text-violet-300">
                                          E
                                        </span>
                                      ) : (
                                        <span className="text-xs text-slate-400">-</span>
                                      )}
                                    </div>

                                    <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                                      📍 {customer.address || "No address"}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()
                    )}
                  </div>
                )}

                {/* TAB 3: SHEET HISTORY */}
                {activeTab === "history" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-[#333] dark:bg-[#212121]">
                      <div className="min-w-0 flex-1 pr-2">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">Archived Sheet History</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Previously closed periods with downloadable reports</p>
                      </div>
                      <span className="shrink-0 whitespace-nowrap rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-bold text-brand-600 dark:bg-blue-500/20 dark:text-blue-400">
                        {historyEntries.length} Saved
                      </span>
                    </div>

                    {historyLoading ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 dark:border-[#333] dark:bg-[#212121] dark:text-slate-400">
                        Loading saved sheets...
                      </div>
                    ) : historyEntries.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 dark:border-[#333] dark:bg-[#212121] dark:text-slate-400">
                        No saved sheets yet for this dairy account.
                      </div>
                    ) : (
                      historyEntries.map((entry, index) => {
                        const isEditing = editingHistoryId === entry.id;
                        const activeEntry = isEditing && editingHistoryState ? editingHistoryState : entry;
                        const effectiveDayCount = getEffectiveDayCount(activeEntry);
                        const entryTotal = activeEntry.rows.reduce(
                          (sum, row) => sum + row.days.reduce((rowSum, value) => rowSum + value, 0),
                          0
                        );
                        const sheetNumber = historyEntries.length - index;
                        const isExpanded = expandedEntryId === entry.id;

                        return (
                          <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-[#333] dark:bg-[#212121] overflow-hidden transition">
                            {/* History Header - clickable to toggle */}
                            <div
                              onClick={() => setExpandedEntryId(isExpanded ? null : entry.id)}
                              className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 p-3.5 sm:p-4 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-[#262626] transition select-none"
                            >
                              <div className="min-w-0 pr-0 sm:pr-2">
                                <div className="flex items-center justify-between gap-2">
                                  {isEditing ? (
                                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                      <input
                                        type="text"
                                        value={editingHistoryState?.name ?? ""}
                                        onChange={(e) => {
                                          if (editingHistoryState) {
                                            setEditingHistoryState({
                                              ...editingHistoryState,
                                              name: e.target.value
                                            });
                                          }
                                        }}
                                        onKeyDown={(e) => {
                                          e.stopPropagation();
                                          if (e.key === "Enter") {
                                            void handleSaveHistorySheet(entry.id);
                                          }
                                        }}
                                        placeholder="Sheet Name"
                                        className="h-8 rounded-lg border border-blue-400 bg-white px-2.5 text-xs sm:text-sm font-bold text-slate-900 shadow-xs outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 dark:border-blue-600 dark:bg-[#181818] dark:text-white w-44 sm:w-60"
                                      />
                                    </div>
                                  ) : (
                                    <h5 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                                      {entry.name || `Sheet ${sheetNumber}`}
                                    </h5>
                                  )}

                                  {/* Mobile only: arrow at the top right */}
                                  <span className={`sm:hidden text-[10px] text-slate-400 transition-transform duration-200 shrink-0 ${isExpanded ? "rotate-180" : "rotate-0"}`}>
                                    ▼
                                  </span>
                                </div>

                                {/* Mobile only: customer stats on its own dedicated row to prevent overlapping */}
                                <div className="flex sm:hidden items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 font-medium flex-wrap mt-0.5">
                                  <span>{getCustomerCount(activeEntry.rows)} Customer</span>
                                  <span>·</span>
                                  <span>{effectiveDayCount} days</span>
                                  <span>·</span>
                                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">Total {entryTotal.toLocaleString("en-IN")}</span>
                                </div>

                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                  Saved on {formatDate(entry.savedAt)}
                                </p>
                              </div>

                              {/* Desktop only: customer stats & arrow on the right side */}
                              <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 shrink-0 font-medium">
                                <span>
                                  {getCustomerCount(activeEntry.rows)} Customer · {effectiveDayCount} days · Total {entryTotal.toLocaleString("en-IN")}
                                </span>
                                <span className={`text-[10px] text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : "rotate-0"}`}>
                                  ▼
                                </span>
                              </div>
                            </div>

                            {/* Expanded Area: Action Buttons & Sheet Table */}
                            {isExpanded && (
                              <div className="border-t border-slate-100 p-3.5 sm:p-4 space-y-3.5 bg-slate-50/40 dark:border-[#2e2e2e] dark:bg-[#191919]">
                                {/* Action Buttons toolbar */}
                                <div className={`flex items-center gap-1.5 sm:gap-2 ${isEditing ? "justify-end" : "justify-between"}`}>
                                  {!isEditing && (
                                    <>
                                      {/* Mobile: Single Download Sheet Dropdown */}
                                      <div className="relative sm:hidden">
                                        <button
                                          type="button"
                                          onClick={() => setOpenSaveMenuId(openSaveMenuId === entry.id ? null : entry.id)}
                                          className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[10.5px] sm:text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-[#444] dark:bg-[#222] dark:text-slate-200 cursor-pointer shadow-xs transition flex items-center gap-1 shrink-0 whitespace-nowrap"
                                        >
                                          <span>📥</span> <span>Download Sheet</span> <span className="text-[9px] text-slate-400">▼</span>
                                        </button>

                                        {openSaveMenuId === entry.id && (
                                          <>
                                            <div className="fixed inset-0 z-20" onClick={() => setOpenSaveMenuId(null)} />
                                            <div className="absolute left-0 top-full mt-1.5 w-40 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden z-30 text-xs font-semibold dark:border-[#333] dark:bg-[#222]">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  void downloadSheetAsPdf(activeEntry, sheetNumber, selectedUser.name || selectedUser.email);
                                                  setOpenSaveMenuId(null);
                                                }}
                                                className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-white/10 flex items-center gap-2 text-slate-700 dark:text-slate-200 transition"
                                              >
                                                <span>📥</span> PDF
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  downloadSheetAsExcel(activeEntry, sheetNumber, selectedUser.name || selectedUser.email);
                                                  setOpenSaveMenuId(null);
                                                }}
                                                className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-white/10 flex items-center gap-2 border-t border-slate-100 dark:border-[#333] text-slate-700 dark:text-slate-200 transition"
                                              >
                                                <span>📊</span> Excel
                                              </button>
                                            </div>
                                          </>
                                        )}
                                      </div>

                                      {/* Desktop: Separate PDF & Excel buttons */}
                                      <div className="hidden sm:flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => { void downloadSheetAsPdf(activeEntry, sheetNumber, selectedUser.name || selectedUser.email); }}
                                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-[#444] dark:bg-[#222] dark:text-slate-200 cursor-pointer shadow-xs transition"
                                        >
                                          📥 PDF
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => downloadSheetAsExcel(activeEntry, sheetNumber, selectedUser.name || selectedUser.email)}
                                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-[#444] dark:bg-[#222] dark:text-slate-200 cursor-pointer shadow-xs transition"
                                        >
                                          📊 Excel
                                        </button>
                                      </div>
                                    </>
                                  )}

                                  <div className={`flex items-center gap-1.5 sm:gap-2 ${isEditing ? "w-full sm:w-auto justify-between sm:justify-end" : "shrink-0"}`}>
                                    {/* Edit Sheet / Cancel Edit Button */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isEditing) {
                                          setEditingHistoryId(null);
                                          setEditingHistoryState(null);
                                          setFocusedHistoryDayCell(null);
                                        } else {
                                          setEditingHistoryId(entry.id);
                                          setEditingHistoryState({
                                            ...JSON.parse(JSON.stringify(entry)),
                                            name: entry.name || `Sheet ${sheetNumber}`
                                          });
                                          if (historySaveTimerRef.current) {
                                            window.clearTimeout(historySaveTimerRef.current);
                                            historySaveTimerRef.current = null;
                                          }
                                          setHistorySaveMsg(null);
                                        }
                                      }}
                                      className={`rounded-xl px-2 sm:px-2.5 py-1.5 text-[10.5px] sm:text-xs font-bold transition cursor-pointer shrink-0 whitespace-nowrap ${
                                        isEditing
                                          ? "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-300"
                                          : "border border-blue-200 bg-blue-50 text-brand-700 hover:bg-blue-100 dark:border-blue-800/50 dark:bg-blue-950/40 dark:text-blue-300"
                                      }`}
                                    >
                                      {isEditing ? "✕ Cancel Edit" : "✏️ Edit Sheet"}
                                    </button>

                                    {/* Save Sheet Button - visible only when editing */}
                                    {isEditing && (
                                      <button
                                        type="button"
                                        onClick={() => void handleSaveHistorySheet(entry.id)}
                                        disabled={isSavingHistory}
                                        className="rounded-xl border border-emerald-500 bg-emerald-600 px-2 sm:px-2.5 py-1.5 text-[10.5px] sm:text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition cursor-pointer shrink-0 whitespace-nowrap ml-auto sm:ml-0"
                                      >
                                        {isSavingHistory ? "Saving..." : "💾 Save Sheet"}
                                      </button>
                                    )}

                                    {!isEditing && (
                                      <button
                                        type="button"
                                        onClick={() => { void handleDeleteHistoryEntry(selectedUser.email, entry.id); }}
                                        className="rounded-xl border border-rose-200 bg-rose-50 px-2 sm:px-2.5 py-1.5 text-[10.5px] sm:text-xs font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300 cursor-pointer transition flex items-center gap-1 sm:gap-1.5 shrink-0 whitespace-nowrap"
                                        title="Delete sheet"
                                      >
                                        <span>🗑️</span> Delete Sheet
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {isEditing && historySaveMsg && (
                                  <p className={`text-xs font-medium p-2.5 rounded-xl border ${
                                    historySaveMsg.includes("success")
                                      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50/70 border-emerald-200 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                                      : "text-rose-600 dark:text-rose-400 bg-rose-50/70 border-rose-200 dark:border-rose-900/40 dark:bg-rose-950/20"
                                  }`}>
                                    {historySaveMsg}
                                  </p>
                                )}

                                {/* Expanded Sheet Table */}
                                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#333]">
                                <table className="w-full min-w-[850px] border-collapse text-center text-xs">
                                  <thead className="bg-slate-100 font-bold text-slate-800 dark:bg-[#262626] dark:text-slate-200">
                                    <tr>
                                      <th className="border border-slate-300 px-2 py-2 dark:border-[#444]">S No</th>
                                      <th className="border border-slate-300 px-3 py-2 text-left dark:border-[#444]">Customer Name</th>
                                      <th className="border border-slate-300 px-2 py-2 dark:border-[#444]">Shift</th>
                                      {Array.from({ length: effectiveDayCount }, (_, d) => (
                                        <th key={`hist-day-${entry.id}-${d}`} className="border border-slate-300 px-1 py-2 dark:border-[#444]">
                                          D{d + 1}
                                        </th>
                                      ))}
                                      <th className="border border-slate-300 px-2 py-2 font-bold text-right dark:border-[#444]">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(() => {
                                      const displaySerials = buildDisplaySerialMap(activeEntry.rows);
                                      const groupStartIndices = buildGroupStartIndices(activeEntry.rows);
                                      const nameCellSpans = buildNameCellSpans(groupStartIndices);
                                      const combinedTotals = buildCombinedTotals(activeEntry.rows, groupStartIndices);
                                      return activeEntry.rows.map((row, rIdx) => {
                                        const rowTotal = row.days.reduce((sum, value) => sum + value, 0);
                                        const nameSpan = nameCellSpans[rIdx];
                                        const displayTotal = nameSpan > 1 ? combinedTotals[rIdx] : rowTotal;
                                        return (
                                          <tr key={`${entry.id}-${row.serialNumber}-${rIdx}`} className="bg-white dark:bg-[#1c1c1c] dark:text-slate-200">
                                            {nameSpan > 0 && (
                                              <td rowSpan={nameSpan} className="border border-slate-200 px-1 py-1 font-semibold align-middle dark:border-[#333]">
                                                {displaySerials[rIdx]}
                                              </td>
                                            )}
                                            {nameSpan > 0 && (
                                              <td rowSpan={nameSpan} className="border border-slate-200 px-2 py-1 text-left font-bold align-middle dark:border-[#333]">
                                                {row.customerName}
                                              </td>
                                            )}
                                            <td className="border border-slate-200 px-1 py-1 dark:border-[#333]">{row.shift || "-"}</td>
                                            {row.days.slice(0, effectiveDayCount).map((val, dIdx) => (
                                              <td key={`${entry.id}-${row.serialNumber}-${dIdx}`} className={`border border-slate-200 font-mono dark:border-[#333] ${isEditing ? "p-0.5 bg-blue-50/20 dark:bg-blue-950/20" : "px-1 py-1"}`}>
                                                {isEditing ? (
                                                  <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={
                                                      focusedHistoryDayCell && focusedHistoryDayCell.rowIndex === rIdx && focusedHistoryDayCell.dayIndex === dIdx
                                                        ? focusedHistoryDayCell.text
                                                        : val === 0
                                                        ? ""
                                                        : String(val)
                                                    }
                                                    onFocus={() => {
                                                      setFocusedHistoryDayCell({
                                                        rowIndex: rIdx,
                                                        dayIndex: dIdx,
                                                        text: val === 0 ? "" : String(val)
                                                      });
                                                    }}
                                                    onChange={(e) => {
                                                      const newText = e.target.value;
                                                      setFocusedHistoryDayCell({ rowIndex: rIdx, dayIndex: dIdx, text: newText });
                                                      handleHistoryDayCellChange(rIdx, dIdx, newText);
                                                    }}
                                                    onBlur={() => {
                                                      setFocusedHistoryDayCell(null);
                                                    }}
                                                    onKeyDown={(e) => {
                                                      if (e.key === "Enter") {
                                                        (e.target as HTMLInputElement).blur();
                                                      }
                                                    }}
                                                    className="w-full min-w-[34px] h-7 text-center rounded border border-transparent hover:border-slate-300 focus:border-brand-500 focus:bg-white bg-transparent font-mono text-xs font-bold text-slate-900 outline-none transition dark:text-white dark:hover:border-[#555] dark:focus:bg-[#161616]"
                                                  />
                                                ) : (
                                                  val === 0 ? "-" : val
                                                )}
                                              </td>
                                            ))}
                                            {nameSpan > 0 && (
                                              <td rowSpan={nameSpan} className="border border-slate-200 px-2 py-1 text-right font-mono font-bold dark:border-[#333]">
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
                          )}
                        </div>
                      );
                      })
                    )}
                  </div>
                )}

                {/* TAB 4: EDIT ACCOUNT & SECURITY */}
                {activeTab === "account" && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs dark:border-[#333] dark:bg-[#212121] space-y-4">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">Profile & Contact Information</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Edit account details on behalf of this dairy</p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                             Full Name
                          </label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Full name"
                            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs md:text-sm text-slate-900 outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 dark:border-[#444] dark:bg-[#161616] dark:text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                          Phone Number
                          </label>
                          <input
                            type="text"
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            placeholder="Phone number"
                            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs md:text-sm text-slate-900 outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 dark:border-[#444] dark:bg-[#161616] dark:text-white"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                            Email Address
                          </label>
                          <input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            placeholder="Email address"
                            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs md:text-sm text-slate-900 outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 dark:border-[#444] dark:bg-[#161616] dark:text-white"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 pt-2 border-t border-slate-100 dark:border-[#333]">
                        <button
                          type="button"
                          onClick={async () => {
                            if (!selectedUser) return;
                            setSaveMessage(null);
                            try {
                              setProfileSaving(true);
                              await updateUserProfileByEmail(selectedUser.email, {
                                name: editName,
                                phone: editPhone,
                                email: editEmail
                              });
                              await loadDashboardData();
                              setSaveMessage("Profile saved successfully!");
                              setTimeout(() => setSaveMessage(null), 3000);
                            } catch (err) {
                              setSaveMessage(err instanceof Error ? err.message : "Failed to save profile.");
                            } finally {
                              setProfileSaving(false);
                            }
                          }}
                          disabled={profileSaving}
                          className="flex min-h-[38px] items-center justify-center rounded-xl bg-brand-600 px-2 sm:px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-700 active:scale-95 disabled:opacity-50 transition cursor-pointer text-center"
                        >
                          {profileSaving ? (
                            "Saving..."
                          ) : (
                            <>
                              <span className="hidden sm:inline">Save Profile Changes</span>
                              <span className="sm:hidden">Save Profile</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            if (!selectedUser) return;
                            if (pwResetTimerRef.current) {
                              window.clearTimeout(pwResetTimerRef.current);
                              pwResetTimerRef.current = null;
                            }
                            setPwResetMsg(null);
                            setPwResetLoading(true);
                            try {
                              await requestPasswordReset(selectedUser.email);
                              setPwResetMsg("Password reset email link sent to " + selectedUser.email);
                            } catch (err) {
                              setPwResetMsg(err instanceof Error ? err.message : "Failed to send reset link.");
                            } finally {
                              setPwResetLoading(false);
                              pwResetTimerRef.current = window.setTimeout(() => {
                                setPwResetMsg(null);
                                pwResetTimerRef.current = null;
                              }, 5000);
                            }
                          }}
                          disabled={pwResetLoading}
                          className="flex min-h-[38px] items-center justify-center gap-1 sm:gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-2 sm:px-3.5 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 active:scale-95 transition dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200 cursor-pointer text-center"
                        >
                          {pwResetLoading ? (
                            "Sending Link..."
                          ) : (
                            <>
                              <span>🔑</span>
                              <span className="hidden sm:inline">Send Password Reset Link</span>
                              <span className="sm:hidden">Reset Password</span>
                            </>
                          )}
                        </button>
                      </div>

                      {saveMessage && (
                        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/40">
                          {saveMessage}
                        </p>
                      )}
                      {pwResetMsg && (
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2.5 rounded-xl border border-amber-200 dark:border-amber-900/40">
                          {pwResetMsg}
                        </p>
                      )}
                    </div>
                  </div>
                )}

              </div>
          </div>
        )}
        {/* EDIT CUSTOMER MODAL */}
        {editingCustomerData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div
              className="fixed inset-0"
              onClick={() => {
                if (!isSavingCustomer) setEditingCustomerData(null);
              }}
            />
            <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xl dark:border-[#333] dark:bg-[#202020] z-10 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#333]">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-bold text-base">
                    ✏️
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">Edit Customer Details</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Update name, mobile, address, or shift</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingCustomerData(null)}
                  disabled={isSavingCustomer}
                  className="rounded-full p-1.5 text-rose-500 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {customerSaveMsg && (
                <div className={`text-xs font-semibold p-2.5 rounded-xl border ${
                  customerSaveMsg.includes("success")
                    ? "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-900/40"
                    : "text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950/30 dark:border-rose-900/40"
                }`}>
                  {customerSaveMsg}
                </div>
              )}

              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Customer Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editingCustomerData.name}
                    onChange={(e) => setEditingCustomerData({ ...editingCustomerData, name: e.target.value })}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs sm:text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-[#444] dark:bg-[#181818] dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Mobile Number
                  </label>
                  <input
                    type="tel"
                    value={editingCustomerData.mobile}
                    onChange={(e) => setEditingCustomerData({ ...editingCustomerData, mobile: e.target.value })}
                    placeholder="e.g. 9876543210"
                    className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs sm:text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-[#444] dark:bg-[#181818] dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Delivery Shift
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingCustomerData({ ...editingCustomerData, shift: "M/E" })}
                      className={`rounded-xl py-2 px-2 text-xs font-bold border transition cursor-pointer text-center ${
                        editingCustomerData.shift === "M/E"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-300 ring-1 ring-emerald-500"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-[#333] dark:bg-[#181818] dark:text-slate-300"
                      }`}
                    >
                      M & E
                      <span className="block text-[10px] font-normal opacity-75">Both Shifts</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingCustomerData({ ...editingCustomerData, shift: "M" })}
                      className={`rounded-xl py-2 px-2 text-xs font-bold border transition cursor-pointer text-center ${
                        editingCustomerData.shift === "M"
                          ? "border-amber-500 bg-amber-50 text-amber-800 dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-300 ring-1 ring-amber-500"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-[#333] dark:bg-[#181818] dark:text-slate-300"
                      }`}
                    >
                      Morning
                      <span className="block text-[10px] font-normal opacity-75">M Only</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingCustomerData({ ...editingCustomerData, shift: "E" })}
                      className={`rounded-xl py-2 px-2 text-xs font-bold border transition cursor-pointer text-center ${
                        editingCustomerData.shift === "E"
                          ? "border-violet-500 bg-violet-50 text-violet-800 dark:border-violet-500 dark:bg-violet-950/50 dark:text-violet-300 ring-1 ring-violet-500"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-[#333] dark:bg-[#181818] dark:text-slate-300"
                      }`}
                    >
                      Evening
                      <span className="block text-[10px] font-normal opacity-75">E Only</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Address / Village
                  </label>
                  <input
                    type="text"
                    value={editingCustomerData.address}
                    onChange={(e) => setEditingCustomerData({ ...editingCustomerData, address: e.target.value })}
                    placeholder="e.g. Near Shiv Temple, Raipur"
                    className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs sm:text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-[#444] dark:bg-[#181818] dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-[#333]">
                <button
                  type="button"
                  onClick={() => setEditingCustomerData(null)}
                  disabled={isSavingCustomer}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-[#444] dark:bg-[#262626] dark:text-slate-300 cursor-pointer transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveCustomerDetails()}
                  disabled={isSavingCustomer}
                  className="rounded-xl border border-blue-600 bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 cursor-pointer transition"
                >
                  {isSavingCustomer ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}