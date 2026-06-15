import React, { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import { useNavigate } from "react-router-dom";
import { deleteUserByEmail, fetchAllUserProfiles, isOwnerLoggedIn, subscribeAuthState, updateUserProfileByEmail } from "../firebase/auth";
import { getCustomersByEmail, getSheetByEmail, type Customer, type SheetState } from "../firebase/data";

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

function StatCard({ title, value, tone, description }: { title: string; value: string; tone: string; description: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className={`mt-2 text-3xl font-bold md:text-4xl ${tone}`}>{value}</div>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  );
}

export default function OwnerDashboard() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userSnapshots, setUserSnapshots] = useState<UserSnapshot[]>([]);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedUserEmail, setSelectedUserEmail] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editFarmName, setEditFarmName] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteInfo, setDeleteInfo] = useState("");
  const hasLoadedActiveTab = useRef(false);

  useEffect(() => {
    if (!isOwnerLoggedIn()) {
      navigate("/login");
      return;
    }

    void loadDashboardData();

    return subscribeAuthState(() => {
      void loadDashboardData();
    });
  }, [navigate]);

  useEffect(() => {
    if (!isOwnerLoggedIn()) {
      return;
    }

    if (!hasLoadedActiveTab.current) {
      hasLoadedActiveTab.current = true;
      return;
    }

    void loadDashboardData();
  }, [activeTab]);

  const loadDashboardData = async () => {
    setLoading(true);
    setDeleteInfo("");

    try {
      const userProfiles = await fetchAllUserProfiles();
      const snapshots = await Promise.all(
        userProfiles.map(async (profile) => {
          const [customers, sheet] = await Promise.all([
            getCustomersByEmail(profile.email),
            getSheetByEmail(profile.email)
          ]);

          const sheetTotal = sheet.rows.reduce(
            (sum, row) => sum + row.days.reduce((rowSum, value) => rowSum + (value || 0), 0),
            0
          );

          return {
            ...profile,
            customers,
            sheet,
            customerCount: customers.length,
            sheetRowCount: sheet.rows.length,
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

  const selectedUser = userSnapshots.find((snapshot) => snapshot.email === selectedUserEmail) ?? null;

  // initialize edit fields when selectedUser changes
  useEffect(() => {
    if (!selectedUser) return;
    setEditName(selectedUser.name || "");
    setEditPhone(selectedUser.phone || "");
    setEditFarmName(selectedUser.farmName || "");
    setEditAvatarUrl(selectedUser.avatarUrl || "");
    setSaveMessage(null);
  }, [selectedUserEmail]);

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
            description="Calculated from your Firestore-backed system data."
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 overflow-x-auto">
            <div className="flex gap-2 p-2 md:gap-4 md:p-4">
              <button
                onClick={() => setActiveTab("overview")}
                className={`min-h-[44px] rounded-full px-4 py-3 text-sm font-medium transition ${
                  activeTab === "overview"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 active:bg-slate-200"
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab("users")}
                className={`min-h-[44px] rounded-full px-4 py-3 text-sm font-medium transition ${
                  activeTab === "users"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 active:bg-slate-200"
                }`}
              >
                Users
              </button>
            </div>
          </div>

          <div className="p-4 md:p-6">
            {activeTab === "overview" && (
              <div className="space-y-5">
                <h2 className="text-xl font-semibold text-slate-800">System Overview</h2>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Users</div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">{users.length}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Revenue</div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">₹{totalEarnings.toLocaleString()}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last Updated</div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">{new Date().toLocaleDateString()}</div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "users" && (
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

                <div className="space-y-3 md:hidden">
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
                        <p>Sheet rows: {user.sheetRowCount}</p>
                        <p>Sheet total: {user.sheetTotal}</p>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setSelectedUserEmail(user.email)}
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

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Name</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Email</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Phone</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Farm</th>
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
                          <td className="px-4 py-4 text-slate-600">{user.farmName || "-"}</td>
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
                                onClick={() => setSelectedUserEmail(user.email)}
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
            )}

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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">User Data</h3>
                  <p className="text-sm text-slate-500">Complete profile, customer list, and sheet data for this account.</p>
                </div>
                <button
                  onClick={() => setSelectedUserEmail(null)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Close
                </button>
              </div>

                <div className="max-h-[calc(90vh-81px)] overflow-y-auto p-5">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Name</div>
                    <div className="mt-2 text-base font-semibold text-slate-900">{selectedUser.name}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</div>
                    <div className="mt-2 break-all text-base font-semibold text-slate-900">{selectedUser.email}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Farm</div>
                    <div className="mt-2 text-base font-semibold text-slate-900">{selectedUser.farmName || "-"}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Updated</div>
                    <div className="mt-2 text-base font-semibold text-slate-900">
                      {selectedUser.updatedAt ? new Date(selectedUser.updatedAt).toLocaleString() : "-"}
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-1">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Customer Records</h4>
                    <div className="mt-3 space-y-3">
                      {selectedUser.customers.length === 0 ? (
                        <p className="text-sm text-slate-500">No customers saved for this user yet.</p>
                      ) : (
                        selectedUser.customers.map((customer) => (
                          <div key={`${selectedUser.email}-${customer.serialNumber}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-medium text-slate-900">{customer.name || "Unnamed customer"}</p>
                                <p className="text-sm text-slate-600">{customer.mobile || "-"}</p>
                              </div>
                              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-800">
                                #{customer.serialNumber}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-slate-600">{customer.address || "No address provided"}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Sheet Data</h4>
                      <div className="text-xs font-medium text-slate-500">
                        {selectedUser.sheet.rows.length} rows · {selectedUser.sheet.dayCount} days · Total {selectedUser.sheetTotal}
                      </div>
                    </div>

                    <div className="mt-4 overflow-x-auto">
                      <table className="min-w-[760px] w-full border-collapse text-sm">
                        <thead className="bg-slate-100 text-slate-700">
                          <tr>
                            <th className="border border-slate-200 px-3 py-2 text-left">S No</th>
                            <th className="border border-slate-200 px-3 py-2 text-left">Customer Name</th>
                            {Array.from({ length: selectedUser.sheet.dayCount }, (_, index) => (
                              <th key={`selected-day-${index + 1}`} className="border border-slate-200 px-3 py-2 text-left">
                                Day {index + 1}
                              </th>
                            ))}
                            <th className="border border-slate-200 px-3 py-2 text-left">Row Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedUser.sheet.rows.map((row) => {
                            const rowTotal = row.days.reduce((sum, value) => sum + (value || 0), 0);

                            return (
                              <tr key={`${selectedUser.email}-sheet-${row.serialNumber}`} className="odd:bg-white even:bg-slate-50">
                                <td className="border border-slate-200 px-3 py-2">{row.serialNumber}</td>
                                <td className="border border-slate-200 px-3 py-2">{row.customerName || "-"}</td>
                                {row.days.map((value, dayIndex) => (
                                  <td key={`${selectedUser.email}-${row.serialNumber}-${dayIndex + 1}`} className="border border-slate-200 px-3 py-2">
                                    {value || 0}
                                  </td>
                                ))}
                                <td className="border border-slate-200 px-3 py-2 font-semibold text-slate-900">{rowTotal}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Edit Profile (Owner)</h4>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Full name"
                      className="rounded-lg border border-slate-300 px-3 py-2"
                    />
                    <input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="Phone"
                      className="rounded-lg border border-slate-300 px-3 py-2"
                    />
                    <input
                      value={editFarmName}
                      onChange={(e) => setEditFarmName(e.target.value)}
                      placeholder="Farm name"
                      className="rounded-lg border border-slate-300 px-3 py-2"
                    />
                    <input
                      value={editAvatarUrl}
                      onChange={(e) => setEditAvatarUrl(e.target.value)}
                      placeholder="Avatar URL"
                      className="rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </div>
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
                            farmName: editFarmName,
                            avatarUrl: editAvatarUrl
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
      </div>
    </Layout>
  );
}
