import { useEffect, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import Layout from "../components/Layout";
import { useNavigate } from "react-router-dom";
import { deleteUserByEmail, fetchAllUserProfiles, isOwnerLoggedIn, requestPasswordReset, subscribeAuthState, updateUserProfileByEmail } from "../firebase/auth";
import {
  archiveSheetByEmail,
  getCustomersByEmail,
  getHistoryByEmail,
  getSheetByEmail,
  saveHistoryByEmail,
  type Customer,
  type SheetHistoryEntry,
  type SheetState
} from "../firebase/data";

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function downloadSheetAsPdf(entry: SheetHistoryEntry, sheetNumber: number, ownerLabel: string) {
  const doc = new jsPDF({ orientation: "landscape" });

  const total = entry.rows.reduce(
    (entryTotal, row) => entryTotal + row.days.reduce((rowTotal, value) => rowTotal + value, 0),
    0
  );

  doc.setFontSize(14);
  doc.text(`Dairy Farm — Sheet ${sheetNumber} (${ownerLabel})`, 14, 15);
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

  doc.save(`dairy-farm-${ownerLabel}-sheet-${sheetNumber}-${entry.savedAt.replace(/[:.]/g, "-")}.pdf`);
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


function UpdatedCard({ updatedAt }: { updatedAt?: string }) {
  return (
    <div className="text-right text-xs font-medium text-slate-500">
      <div>Last Updated</div>
      <div className="mt-1">
        {updatedAt ? new Date(updatedAt).toLocaleString([], { hour12: true, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "-"}
      </div>
    </div>
  );
}

function StatCard({ title, value, tone, description }: { title: string; value: string; tone: string; description: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className={`mt-2 text-3xl font-bold md:text-4xl ${tone}`}>{value}</div>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  );
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
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userSnapshots, setUserSnapshots] = useState<UserSnapshot[]>([]);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [selectedUserEmail, setSelectedUserEmail] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [pwResetMsg, setPwResetMsg] = useState<string | null>(null);
  const [pwResetLoading, setPwResetLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteInfo, setDeleteInfo] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [archiveMsg, setArchiveMsg] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<SheetHistoryEntry[]>([]);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOwnerLoggedIn()) {
      navigate("/login");
      return;
    }

    void loadDashboardData();

    const interval = setInterval(() => { void loadDashboardData(); }, 3000);

    const unsubscribe = subscribeAuthState(() => {
      void loadDashboardData();
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [navigate]);

  const loadDashboardData = async () => {
    setLoading(true);
    setDeleteInfo("");

    try {
      const userProfiles = await fetchAllUserProfiles();
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
      setUsers([]);
      setUserSnapshots([]);
      setTotalEarnings(0);
    } finally {
      setLoading(false);
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

    if (!window.confirm(`Save ${email}'s current sheet to history and reset it for a new period?`)) {
      return;
    }

    setArchiving(true);
    setArchiveMsg(null);
    try {
      await archiveSheetByEmail(email, sheet);
      await loadDashboardData();
      if (showHistory) {
        setHistoryEntries(await getHistoryByEmail(email));
      }
      setArchiveMsg("Sheet saved to history and reset.");
    } catch (error) {
      setArchiveMsg(error instanceof Error ? error.message : "Failed to save to history.");
    } finally {
      setArchiving(false);
    }
  };

  const handleToggleHistory = async (email: string) => {
    if (showHistory) {
      setShowHistory(false);
      return;
    }

    setShowHistory(true);
    setHistoryLoading(true);
    try {
      await loadDashboardData();
      setHistoryEntries(await getHistoryByEmail(email));
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

  const selectedUser = userSnapshots.find((snapshot) => snapshot.email === selectedUserEmail) ?? null;

  // initialize edit fields when selectedUser changes
  useEffect(() => {
    if (!selectedUser) return;
    setEditName(selectedUser.name || "");
    setEditPhone(selectedUser.phone || "");
    setEditEmail(selectedUser.email || "");
    setSaveMessage(null);
    setPwResetMsg(null);
    setArchiveMsg(null);
    setShowHistory(false);
    setHistoryEntries([]);
    setExpandedEntryId(null);
  }, [selectedUserEmail]);

  // Keep the opened user details screen updated with the latest customers, data sheet, and history.
  useEffect(() => {
    if (!selectedUserEmail) return;

    let cancelled = false;

    const refreshSelectedUserData = async () => {
      await loadDashboardData();

      if (!cancelled && showHistory) {
        setHistoryEntries(await getHistoryByEmail(selectedUserEmail));
      }
    };

    void refreshSelectedUserData();
    const interval = window.setInterval(() => {
      void refreshSelectedUserData();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [selectedUserEmail, showHistory]);

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-4 md:p-6">
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur sm:p-5 md:mb-8 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              
              <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Owner Dashboard</h1>
            
            </div>
            {deleteInfo ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 lg:max-w-md">
                {deleteInfo}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            title="Total Users"
            value={`${users.length}`}
            tone="text-blue-600"
            description="Registered accounts in your system."
          />
          <StatCard
            title="Customer Records"
            value={`${userSnapshots.reduce((sum, snapshot) => sum + snapshot.customerCount, 0)}`}
            tone="text-emerald-600"
            description="All customer entries stored across every user."
          />
          <StatCard
            title="Total Earnings"
            value={`₹${totalEarnings.toLocaleString()}`}
            tone="text-violet-600"
            description="Calculated from your system data."
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="p-4 md:p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-800 md:text-xl">All User Data</h2>
                <div className="text-xs font-medium text-slate-500">{users.length} total</div>
              </div>

                {loading && users.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                    Loading users...
                  </div>
                ) : null}

                {users.length === 0 && !loading ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                    Users will appear here after they sign up for an account.
                  </div>
                ) : null}

                <div className="hidden">
                  {userSnapshots.map((user) => (
                    <div key={user.email} className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-base font-semibold text-slate-900">{user.name}</div>
                                <div className="truncate text-sm text-slate-600">{user.email}</div>
                        </div>
                        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-800">
                          {user.role}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1 text-sm text-slate-600">
                        <p>Farm: {user.farmName || "-"}</p>
                        <p>{user.phone || "-"}</p>
                        <p>Customers: {user.customerCount}</p>
                        <p>Sheet rows: {user.customerCount}</p>
                        <p>Sheet total: {user.sheetTotal}</p>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <button
                          onClick={() => { setSelectedUserEmail(user.email); setShowHistory(false); setHistoryEntries([]); }}
                          className="flex min-h-[44px] items-center justify-center rounded-lg bg-blue-100 px-4 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-200 active:bg-blue-300"
                        >
                          View Data
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(user.email)}
                          disabled={loading}
                          className="flex min-h-[44px] items-center justify-center rounded-lg bg-red-100 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-200 active:bg-red-300 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Name</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Email</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Phone</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Customers</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Sheet Total</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Role</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userSnapshots.map((user) => (
                        <tr key={user.email} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-4 font-medium text-slate-900">{user.name}</td>
                          <td className="px-4 py-4 text-slate-600">{user.email}</td>
                          <td className="px-4 py-4 text-slate-600">{user.phone || "-"}</td>
                          <td className="px-4 py-4 text-slate-600">{user.customerCount}</td>
                          <td className="px-4 py-4 text-slate-600">{user.sheetTotal}</td>
                          <td className="px-4 py-4">
                            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-blue-800">
                              {user.role}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => { setSelectedUserEmail(user.email); setShowHistory(false); setHistoryEntries([]); }}
                                className="flex min-h-[40px] items-center justify-center rounded-lg bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-200 active:bg-blue-300"
                              >
                                View Data
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(user.email)}
                                disabled={loading}
                                className="flex min-h-[40px] items-center justify-center rounded-lg bg-red-100 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-200 active:bg-red-300 disabled:opacity-50"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="mb-3 text-lg font-semibold text-slate-900">Delete User</h3>
              <p className="mb-6 text-sm leading-6 text-slate-600">
                Are you sure you want to delete <strong>{deleteConfirm}</strong>? This action cannot be undone and all their data will be removed.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={loading}
                  className="flex min-h-[48px] items-center justify-center rounded-lg border border-slate-300 px-4 py-3 font-medium text-slate-700 transition hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteUser(deleteConfirm)}
                  disabled={loading}
                  className="flex min-h-[48px] items-center justify-center rounded-lg bg-red-600 px-4 py-3 font-medium text-white transition hover:bg-red-700 active:bg-red-800 disabled:opacity-50"
                >
                  {loading ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedUser && (
          <div className="fixed inset-0 z-50 bg-white">
            <div className="flex h-screen w-screen flex-col overflow-hidden bg-white">
              <div className="relative flex items-start justify-between gap-4 border-b border-slate-200 p-5 pr-16">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">User Data</h3>
                  <p className="text-sm text-slate-500">Complete profile, customer list, and sheet data for this account.</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-end gap-2 text-right">
                    <UpdatedCard updatedAt={selectedUser.sheet.updatedAt ?? selectedUser.updatedAt} />
                    <button
                      type="button"
                      onClick={() => handleToggleHistory(selectedUser.email)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      {showHistory ? "Hide History" : "View History"}
                    </button>
                  </div>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => setSelectedUserEmail(null)}
                    className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center bg-transparent p-0 text-xl font-bold leading-none text-red-500 transition hover:text-red-600 active:text-red-700"
                  >
                    ×
                  </button>
                </div>
              </div>

                <div className="flex-1 overflow-y-auto p-5">
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-1">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Customer Records</h4>
                    <div className="mt-3 space-y-3">
                      {selectedUser.customers.length === 0 ? (
                        <p className="text-sm text-slate-500">No customers saved for this user yet.</p>
                      ) : (
                        (() => {
                          const seen = new Map<string, { customer: typeof selectedUser.customers[0]; shifts: string[] }>();
                          selectedUser.customers.forEach((c) => {
                            const key = c.name.trim().toLowerCase();
                            if (!key) return;
                            if (seen.has(key)) {
                              if (c.shift) seen.get(key)!.shifts.push(c.shift);
                            } else {
                              seen.set(key, { customer: c, shifts: c.shift ? [c.shift] : [] });
                            }
                          });
                          return Array.from(seen.values()).map(({ customer, shifts }, idx) => (
                            <div key={`${selectedUser.email}-${customer.name}-${idx}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium text-slate-900">{customer.name}</p>
                                  <p className="text-sm text-slate-600">{customer.mobile || "-"}</p>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-800">
                                    #{idx + 1}
                                  </span>
                                  {shifts.length > 0 && (
                                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                                      {shifts.join(" & ")}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <p className="mt-2 text-sm text-slate-600">{customer.address || "No address provided"}</p>
                            </div>
                          ));
                        })()
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
                    {!showHistory && (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Sheet Data</h4>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="text-xs font-medium text-slate-500">
                          {selectedUser.sheet.rows.length} rows · {selectedUser.sheet.dayCount} days · Total {selectedUser.sheetTotal}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleArchiveToHistory(selectedUser.email, selectedUser.sheet)}
                          disabled={archiving}
                          className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {archiving ? "Saving..." : "Save to History"}
                        </button>
                      </div>
                    </div>
                    )}
                    {archiveMsg && (
                      <p className="mt-2 text-xs text-slate-600">{archiveMsg}</p>
                    )}

                    {showHistory && (
                      <div className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        {historyLoading ? (
                          <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-500">
                            Loading history...
                          </div>
                        ) : historyEntries.length === 0 ? (
                          <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-500">
                            No saved sheets yet for this user.
                          </div>
                        ) : (
                          historyEntries.map((entry, index) => {
                            const entryTotal = entry.rows.reduce(
                              (sum, row) => sum + row.days.reduce((rowSum, value) => rowSum + value, 0),
                              0
                            );
                            const sheetNumber = historyEntries.length - index;

                            return (
                              <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <h5 className="text-base font-semibold text-slate-900">
                                      {entry.name || `Sheet ${sheetNumber}`}
                                    </h5>
                                    <p className="text-xs text-slate-500">Saved on {formatDate(entry.savedAt)}</p>
                                  </div>
                                  <div className="text-xs font-medium text-slate-600">
                                    {getCustomerCount(entry.rows)} Customer · {entry.dayCount} days · Total {entryTotal}
                                  </div>
                                </div>

                                <div className="mb-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => downloadSheetAsPdf(entry, sheetNumber, selectedUser.name || selectedUser.email)}
                                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                                  >
                                    Save to Local Device
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteHistoryEntry(selectedUser.email, entry.id)}
                                    className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 transition"
                                  >
                                    Delete Sheet
                                  </button>
                                </div>

                                <div className="overflow-x-auto rounded-lg border border-slate-200">
                                  <table className="min-w-[900px] border-collapse text-center text-xs">
                                    <thead className="bg-slate-100 font-semibold text-slate-800">
                                      <tr>
                                        <th className="border border-slate-300 px-1 py-2">S No</th>
                                        <th className="border border-slate-300 px-1 py-2">Customer Name</th>
                                        <th className="border border-slate-300 px-1 py-2">Shift</th>
                                        {Array.from({ length: entry.dayCount }, (_, dayIndex) => (
                                          <th key={`owner-history-${entry.id}-day-${dayIndex + 1}`} className="border border-slate-300 px-1 py-2">
                                            Day {dayIndex + 1}
                                          </th>
                                        ))}
                                        <th className="border border-slate-300 px-1 py-2">Total</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(() => {
                                        const displaySerials = buildDisplaySerialMap(entry.rows);
                                        return entry.rows.map((row, rowIndex) => {
                                          const rowTotal = row.days.reduce((sum, value) => sum + value, 0);
                                          return (
                                            <tr key={`${entry.id}-${row.serialNumber}`} className="even:bg-slate-50">
                                              <td className="border border-slate-200 px-1 py-1 font-semibold">{displaySerials[rowIndex]}</td>
                                              <td className="border border-slate-200 px-1 py-1 text-left">{row.customerName}</td>
                                              <td className="border border-slate-200 px-1 py-1">{row.shift || "—"}</td>
                                              {row.days.map((value, dayIndex) => (
                                                <td key={`${entry.id}-${row.serialNumber}-${dayIndex + 1}`} className="border border-slate-200 px-1 py-1">
                                                  {value}
                                                </td>
                                              ))}
                                              <td className="border border-slate-200 px-1 py-1 font-semibold">{rowTotal}</td>
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
                    )}

                    {!showHistory && (
                    <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                      <table className="min-w-[900px] border-collapse text-center text-xs">
                        <thead className="bg-slate-100 font-semibold text-slate-800">
                          <tr>
                            <th className="border border-slate-300 px-1 py-2">S No</th>
                            <th className="border border-slate-300 px-1 py-2">Customer Name</th>
                            <th className="border border-slate-300 px-1 py-2">Shift</th>
                            {Array.from({ length: selectedUser.sheet.dayCount }, (_, index) => (
                              <th key={`selected-day-${index + 1}`} className="border border-slate-300 px-1 py-2">
                                Day {index + 1}
                              </th>
                            ))}
                            <th className="border border-slate-300 px-1 py-2">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const displaySerials = buildDisplaySerialMap(selectedUser.sheet.rows);
                            const groupStartIndices = buildGroupStartIndices(selectedUser.sheet.rows);
                            const nameCellSpans = buildNameCellSpans(groupStartIndices);
                            const combinedTotals = buildCombinedTotals(selectedUser.sheet.rows, groupStartIndices);
                            return selectedUser.sheet.rows.map((row, rowIndex) => {
                            const rowTotal = row.days.reduce((sum, value) => sum + value, 0);
                            const nameSpan = nameCellSpans[rowIndex];
                            const displayTotal = nameSpan > 1 ? combinedTotals[rowIndex] : rowTotal;

                            return (
                              <tr key={`${selectedUser.email}-sheet-${row.serialNumber}`} className="even:bg-slate-50">
                                <td className="border border-slate-200 px-1 py-1 font-semibold">{displaySerials[rowIndex]}</td>
                                {nameSpan > 0 && (
                                  <td rowSpan={nameSpan} className="border border-slate-200 px-1 py-1 text-left">{row.customerName}</td>
                                )}
                                <td className="border border-slate-200 px-1 py-1">{row.shift}</td>
                                {row.days.map((value, dayIndex) => (
                                  <td key={`${selectedUser.email}-${row.serialNumber}-${dayIndex + 1}`} className="border border-slate-200 px-1 py-1">
                                    {value}
                                  </td>
                                ))}
                                {nameSpan > 0 && (
                                  <td rowSpan={nameSpan} className="border border-slate-200 px-1 py-1 font-semibold">{displayTotal}</td>
                                )}
                              </tr>
                            );
                          });
                          })()}
                        </tbody>
                      </table>
                    </div>
                    )}
                  </div>
                </div>

                <div className="mt-6">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Edit Profile (Owner)</h4>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Full name"
                      className="min-h-[48px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    />
                    <input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="Phone"
                      className="min-h-[48px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    />
                    <input
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="Email"
                      type="email"
                      className="min-h-[48px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!selectedUser) return;
                        setPwResetMsg(null);
                        setPwResetLoading(true);
                        try {
                          await requestPasswordReset(selectedUser.email);
                          setPwResetMsg("Password reset email sent!");
                        } catch (err) {
                          setPwResetMsg(err instanceof Error ? err.message : "Failed to send reset email");
                        } finally {
                          setPwResetLoading(false);
                        }
                      }}
                      disabled={pwResetLoading || loading}
                      className="min-h-[48px] w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition"
                    >
                      {pwResetLoading ? "Sending..." : "Send Password Reset Email"}
                    </button>
                  </div>
                  {pwResetMsg && <p className="mt-2 text-xs text-slate-600">{pwResetMsg}</p>}
                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={async () => {
                        if (!selectedUser) return;
                        setSaveMessage(null);
                        try {
                          setLoading(true);
                          await updateUserProfileByEmail(selectedUser.email, {
                            name: editName,
                            phone: editPhone,
                            email: editEmail
                          });
                          await loadDashboardData();
                          setSaveMessage("Saved successfully");
                        } catch (err) {
                          setSaveMessage(err instanceof Error ? err.message : "Failed to save");
                        } finally {
                          setLoading(false);
                        }
                      }}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-white"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setSelectedUserEmail(null);
                      }}
                      className="rounded-lg border border-slate-300 px-4 py-2"
                    >
                      Close
                    </button>
                    {saveMessage ? <div className="text-sm text-slate-600">{saveMessage}</div> : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
    </Layout>
  );
}
