import React, { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { useNavigate } from "react-router-dom";
import { isOwnerLoggedIn, deleteUserByEmail, subscribeAuthState, getAllUserProfiles } from "../firebase/auth";

interface UserProfile {
  email: string;
  name: string;
  phone: string;
  role: string;
  avatarUrl?: string;
}

interface MilkEntry {
  date: string;
  customerEmail?: string;
  entries: Array<{
    serialNumber: number;
    quantity: number;
    rate: number;
    amount: number;
  }>;
}

export default function OwnerDashboard() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [totalMilk, setTotalMilk] = useState(0);
  const [activeTab, setActiveTab] = useState("overview");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOwnerLoggedIn()) {
      navigate("/login");
      return;
    }

    loadDashboardData();

    // Subscribe to changes in auth state to reload users
    return subscribeAuthState(() => {
      loadDashboardData();
    });
  }, [navigate]);

  const loadDashboardData = () => {
    // Load all user profiles using the auth function
    try {
      const userProfiles = getAllUserProfiles();
      setUsers(userProfiles);

      // Calculate total earnings and milk
      let totalAmount = 0;
      let totalQuantity = 0;

      userProfiles.forEach((user: UserProfile) => {
        try {
          const milkData = JSON.parse(
            localStorage.getItem(`milk-data-${user.email}`) || "{}"
          );
          Object.values(milkData).forEach((dayData: any) => {
            if (Array.isArray(dayData)) {
              dayData.forEach((entry: any) => {
                totalAmount += entry.amount || 0;
                totalQuantity += entry.quantity || 0;
              });
            }
          });
        } catch (e) {
          // Silently ignore milk data loading errors
        }
      });

      setTotalEarnings(totalAmount);
      setTotalMilk(totalQuantity);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
      setUsers([]);
      setTotalEarnings(0);
      setTotalMilk(0);
    }
  };

  const handleDeleteUser = async (email: string) => {
    if (loading) return;

    setLoading(true);
    try {
      await deleteUserByEmail(email);
      setDeleteConfirm(null);
      loadDashboardData();
    } catch (error) {
      alert(`Error deleting user: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="p-6 bg-gray-50 min-h-screen">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Owner Dashboard</h1>
            <p className="text-gray-600 mt-2">System Overview & Management</p>
          </div>
          <button
            onClick={loadDashboardData}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium text-sm"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-gray-500 text-sm font-medium">Total Users</div>
            <div className="text-3xl font-bold text-blue-600 mt-2">
              {users.length}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-gray-500 text-sm font-medium">Total Milk</div>
            <div className="text-3xl font-bold text-green-600 mt-2">
              {totalMilk.toFixed(1)} L
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-gray-500 text-sm font-medium">
              Total Earnings
            </div>
            <div className="text-3xl font-bold text-purple-600 mt-2">
              ₹{totalEarnings.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <div className="flex gap-4 p-4">
              <button
                onClick={() => setActiveTab("overview")}
                className={`px-4 py-2 font-medium text-sm ${
                  activeTab === "overview"
                    ? "text-blue-600 border-b-2 border-blue-600 pb-2"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab("users")}
                className={`px-4 py-2 font-medium text-sm ${
                  activeTab === "users"
                    ? "text-blue-600 border-b-2 border-blue-600 pb-2"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Users
              </button>
              <button
                onClick={() => setActiveTab("reports")}
                className={`px-4 py-2 font-medium text-sm ${
                  activeTab === "reports"
                    ? "text-blue-600 border-b-2 border-blue-600 pb-2"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Reports
              </button>
            </div>
          </div>

          <div className="p-6">
            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div>
                <h2 className="text-xl font-semibold mb-4 text-gray-700">
                  System Overview
                </h2>
                <div className="space-y-3 text-gray-600">
                  <p>
                    <span className="font-medium">Active Users:</span>{" "}
                    {users.length}
                  </p>
                  <p>
                    <span className="font-medium">Total Milk Collected:</span>{" "}
                    {totalMilk.toFixed(1)} Liters
                  </p>
                  <p>
                    <span className="font-medium">Total Revenue:</span> ₹
                    {totalEarnings.toLocaleString()}
                  </p>
                  <p className="mt-4 text-sm">
                    Last updated: {new Date().toLocaleDateString()}
                  </p>
                </div>
              </div>
            )}

            {/* Users Tab */}
            {activeTab === "users" && (
              <div>
                <h2 className="text-xl font-semibold mb-4 text-gray-700">
                  Registered Users
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-gray-700">
                          Name
                        </th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-700">
                          Email
                        </th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-700">
                          Phone
                        </th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-700">
                          Role
                        </th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-700">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3">{user.name}</td>
                          <td className="px-4 py-3">{user.email}</td>
                          <td className="px-4 py-3">{user.phone}</td>
                          <td className="px-4 py-3">
                            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                              {user.role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setDeleteConfirm(user.email)}
                              disabled={loading}
                              className="bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 px-3 py-1 rounded text-xs font-medium transition"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {users.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      <p className="mb-2">No users registered yet</p>
                      <p className="text-sm">Users will appear here after they sign up for an account.</p>
                      <p className="text-xs mt-4 text-gray-400">
                        Debug: Check if "dairy-farm-user-profiles" exists in localStorage
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Reports Tab */}
            {activeTab === "reports" && (
              <div>
                <h2 className="text-xl font-semibold mb-4 text-gray-700">
                  Financial Reports
                </h2>
                <div className="space-y-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="text-gray-600 font-medium">
                      Total Revenue (All Time)
                    </div>
                    <div className="text-2xl font-bold text-blue-600 mt-2">
                      ₹{totalEarnings.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="text-gray-600 font-medium">
                      Total Milk Collected (All Time)
                    </div>
                    <div className="text-2xl font-bold text-green-600 mt-2">
                      {totalMilk.toFixed(1)} L
                    </div>
                  </div>
                  {totalMilk > 0 && (
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <div className="text-gray-600 font-medium">
                        Average Rate per Liter
                      </div>
                      <div className="text-2xl font-bold text-purple-600 mt-2">
                        ₹{(totalEarnings / totalMilk).toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                Delete User
              </h3>
              <p className="text-gray-600 mb-4">
                Are you sure you want to delete <strong>{deleteConfirm}</strong>?
                This action cannot be undone and all their data will be removed.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={loading}
                  className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteUser(deleteConfirm)}
                  disabled={loading}
                  className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {loading ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
