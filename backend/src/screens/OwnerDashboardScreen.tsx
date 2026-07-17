import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { deleteUserProfile, fetchUserProfiles, resetPassword, updateUserProfileByEmail } from "../firebase";
import {
  archiveSheetByEmail,
  deleteHistoryEntryByEmail,
  getCustomersByEmail,
  getHistoryByEmail,
  getSheetByEmail
} from "../storage";
import { colors, styles as t } from "../theme";
import type { Customer, SheetHistoryEntry, SheetState, UserProfile } from "../types";

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

function buildHistoryPdfHtml(entry: SheetHistoryEntry, ownerLabel: string) {
  const displaySerialNumbers = buildDisplaySerialMap(entry.rows);
  const savedDate = formatDate(entry.savedAt);
  const rowsHtml = entry.rows
    .map((row, index) => {
      const total = row.days.reduce((sum, value) => sum + (value || 0), 0);
      const cells = [
        `<td class="serial">${escapeHtml(displaySerialNumbers[index] ?? String(row.serialNumber))}</td>`,
        `<td class="name">${escapeHtml(row.customerName)}</td>`,
        `<td class="shift">${escapeHtml(row.shift ?? "")}</td>`,
        ...row.days.map((value) => `<td class="day">${value === 0 ? "" : String(value)}</td>`),
        `<td class="total">${total.toFixed(1)}</td>`
      ].join("");

      return `<tr>${cells}</tr>`;
    })
    .join("");

  const headerHtml = [
    "<th class=\"serial\">S No</th>",
    "<th class=\"name\">Customer Name</th>",
    "<th class=\"shift\">Shift</th>",
    ...Array.from({ length: entry.dayCount }, (_, index) => `<th class=\"day\">Day ${index + 1}</th>`),
    "<th class=\"total\">Total</th>"
  ].join("");

  const grandTotal = entry.rows.reduce(
    (sum, row) => sum + row.days.reduce((rowSum, value) => rowSum + (value || 0), 0),
    0
  );

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          @page { size: A4 landscape; margin: 12px; }
          body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; padding: 0; }
          .page { padding: 12px; }
          .header { margin-bottom: 12px; }
          .eyebrow { color: #64748b; font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
          h1 { font-size: 20px; margin: 4px 0 2px; }
          .meta { color: #64748b; font-size: 11px; }
          table { border-collapse: collapse; width: 100%; table-layout: fixed; }
          th, td { border: 1px solid #cbd5e1; font-size: 9px; padding: 5px 4px; text-align: center; vertical-align: middle; word-break: break-word; }
          th { background: #e2e8f0; font-weight: 700; }
          tbody tr:nth-child(even) td { background: #f8fafc; }
          .serial { width: 38px; }
          .name { width: 110px; text-align: left; }
          .shift { width: 52px; }
          .day { width: 34px; }
          .total { width: 42px; font-weight: 700; }
          .summary { margin-top: 10px; font-size: 11px; font-weight: 700; }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="eyebrow">Dairy Farm Record — ${escapeHtml(ownerLabel)}</div>
            <h1>History Sheet</h1>
            <div class="meta">Saved: ${escapeHtml(savedDate)} | Rows: ${entry.rows.length} | Days: ${entry.dayCount}</div>
          </div>
          <table>
            <thead><tr>${headerHtml}</tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <div class="summary">Grand Total: ${grandTotal.toFixed(1)}</div>
        </div>
      </body>
    </html>
  `;
}

type UserSnapshot = UserProfile & {
  customers: Customer[];
  sheet: SheetState;
  customerCount: number;
  sheetTotal: number;
};

function groupCustomersByName(customers: Customer[]): Customer[][] {
  const groups: Customer[][] = [];
  let currentKey: string | null = null;

  for (const customer of customers) {
    const key = customer.name.trim().toLowerCase();
    if (key && key === currentKey) {
      groups[groups.length - 1].push(customer);
    } else {
      groups.push([customer]);
      currentKey = key || null;
    }
  }

  return groups;
}

function formatShiftLabel(group: Customer[]): string {
  if (group.length > 1) {
    const shifts = group.map((c) => c.shift).filter(Boolean);
    return shifts.length > 0 ? shifts.join(" & ") : "M & E";
  }

  return group[0].shift || "-";
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
  const totals = rows.map((row) => row.days.reduce((sum, value) => sum + (value || 0), 0));
  const groupSums = new Array(rows.length).fill(0);
  groupStartIndices.forEach((start, index) => {
    groupSums[start] += totals[index];
  });

  return groupStartIndices.map((start, index) => (start === index ? groupSums[start] : 0));
}

export default function OwnerDashboardScreen() {
  const [snapshots, setSnapshots] = useState<UserSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSnapshot | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<SheetHistoryEntry[]>([]);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const profiles = await fetchUserProfiles();
      const next = await Promise.all(
        profiles.map(async (profile) => {
          const [customers, sheet] = await Promise.all([
            getCustomersByEmail(profile.email),
            getSheetByEmail(profile.email)
          ]);
          const sheetTotal = sheet.rows.reduce(
            (sum, row) => sum + row.days.reduce((s, v) => s + (v || 0), 0),
            0
          );
          return { ...profile, customers, sheet, customerCount: customers.length, sheetTotal };
        })
      );
      setSnapshots(next);
    } catch {
      Alert.alert("Error", "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleArchiveToHistory = (user: UserSnapshot) => {
    if (archiving) return;

    const isEmpty = user.sheet.rows.every(
      (row) => !row.customerName.trim() && row.days.every((value) => !value)
    );
    if (isEmpty) {
      Alert.alert("Nothing to save", "This user's sheet is empty.");
      return;
    }

    Alert.alert(
      "Save to History",
      `Save ${user.email}'s current sheet to history and reset it for a new period?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save",
          onPress: async () => {
            setArchiving(true);
            try {
              await archiveSheetByEmail(user.email, user.sheet);
              await loadData();
              if (showHistory) {
                setHistoryEntries(await getHistoryByEmail(user.email));
              }
              Alert.alert("Saved", "Sheet saved to history and reset.");
            } catch (error) {
              Alert.alert("Error", error instanceof Error ? error.message : "Failed to save to history.");
            } finally {
              setArchiving(false);
            }
          }
        }
      ]
    );
  };

  const openUserModal = (user: UserSnapshot) => {
    setShowHistory(false);
    setHistoryEntries([]);
    setExpandedEntryId(null);
    setEditName(user.name || "");
    setEditPhone(user.phone || "");
    setEditEmail(user.email || "");
    setSelectedUser(user);
  };

  const closeUserModal = () => {
    setSelectedUser(null);
    setShowHistory(false);
    setHistoryEntries([]);
    setExpandedEntryId(null);
  };

  const handleSaveProfile = async (user: UserSnapshot) => {
    setSavingProfile(true);
    try {
      await updateUserProfileByEmail(user.email, {
        name: editName,
        phone: editPhone,
        email: editEmail
      });
      await loadData();
      Alert.alert("Saved", "Profile updated successfully.");
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to save profile.");
    } finally {
      setSavingProfile(false);
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
      setHistoryEntries(await getHistoryByEmail(email));
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSaveHistoryToDevice = async (entry: SheetHistoryEntry, ownerLabel: string) => {
    try {
      const pdf = await Print.printToFileAsync({ html: buildHistoryPdfHtml(entry, ownerLabel) });
      const canShare = await Sharing.isAvailableAsync();

      if (!canShare) {
        Alert.alert("Error", "Sharing is not available on this device");
        return;
      }

      await Sharing.shareAsync(pdf.uri, {
        mimeType: "application/pdf",
        dialogTitle: "Save Milk Sheet PDF",
        UTI: "com.adobe.pdf"
      });
    } catch (error) {
      Alert.alert("Error", "Failed to generate PDF");
    }
  };

  const handleDeleteHistoryEntry = (email: string, entry: SheetHistoryEntry) => {
    Alert.alert(
      "Delete History",
      `Delete sheet saved on ${formatDate(entry.savedAt)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const remaining = await deleteHistoryEntryByEmail(email, entry.id);
              setHistoryEntries(remaining);
              if (expandedEntryId === entry.id) setExpandedEntryId(null);
            } catch (error) {
              Alert.alert("Error", "Failed to delete sheet");
            }
          }
        }
      ]
    );
  };

  const handleResetPassword = (user: UserSnapshot) => {
    Alert.alert(
      "Reset Password",
      `Send a password reset email to ${user.email}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: async () => {
            try {
              await resetPassword(user.email);
              Alert.alert("Sent", `Password reset email sent to ${user.email}.`);
            } catch (error) {
              Alert.alert("Error", error instanceof Error ? error.message : "Failed to send reset email.");
            }
          }
        }
      ]
    );
  };

  const handleDelete = (user: UserSnapshot) => {
    Alert.alert(
      "Delete User",
      `Are you sure you want to delete ${user.email}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteUserProfile(user.email);
              setSnapshots((prev) => prev.filter((s) => s.email !== user.email));
              if (selectedUser?.email === user.email) closeUserModal();
            } catch (error) {
              Alert.alert("Error", error instanceof Error ? error.message : "Failed to delete user");
            }
          }
        }
      ]
    );
  };

  const totalCustomers = snapshots.reduce((sum, s) => sum + s.customerCount, 0);
  const totalEarnings = snapshots.reduce((sum, s) => sum + s.sheetTotal, 0);

  return (
    <SafeAreaView style={t.screen}>
      <ScrollView
        contentContainerStyle={t.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View>
          <Text style={t.title}>Owner Dashboard</Text>
          <Text style={[t.subtitle, { marginTop: 4 }]}>Manage registered users</Text>
        </View>

        <View style={s.statsRow}>
          <StatCard label="Total Users" value={String(snapshots.length)} color={colors.primary} />
          <StatCard label="Customers" value={String(totalCustomers)} color="#059669" />
          <StatCard label="Earnings" value={`₹${totalEarnings.toLocaleString()}`} color="#7c3aed" small />
        </View>

        <View style={t.card}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Registered Users</Text>
            <Text style={s.sectionCount}>{snapshots.length} total</Text>
          </View>

          {loading && snapshots.length === 0 && (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )}

          {!loading && snapshots.length === 0 && (
            <Text style={s.emptyText}>No users registered yet.</Text>
          )}

          {snapshots.map((user) => (
            <View key={user.email} style={s.userCard}>
              <View style={s.userHeader}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>
                    {(user.name || user.email || "U").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={s.nameRow}>
                    <Text style={s.userName} numberOfLines={1}>{user.name || user.email}</Text>
                    <View style={s.roleBadge}>
                      <Text style={s.roleBadgeText}>USER</Text>
                    </View>
                  </View>
                  <Text style={s.userEmail} numberOfLines={1}>{user.email}</Text>
                </View>
              </View>

              <View style={s.userMeta}>
                {!!user.phone && <Text style={s.metaText}>{user.phone}</Text>}
                {!!user.farmName && <Text style={s.metaText}>{user.farmName}</Text>}
                <Text style={s.metaText}>{new Date(user.updatedAt).toLocaleDateString()}</Text>
              </View>

              <View style={s.userStats}>
                <View style={s.userStat}>
                  <Text style={s.userStatLabel}>Customers</Text>
                  <Text style={s.userStatValue}>{user.customerCount}</Text>
                </View>
                <View style={s.userStat}>
                  <Text style={s.userStatLabel}>Sheet Total</Text>
                  <Text style={s.userStatValue}>{user.sheetTotal}</Text>
                </View>
                <View style={s.userStat}>
                  <Text style={s.userStatLabel}>Rows</Text>
                  <Text style={s.userStatValue}>{user.sheet.rows.length}</Text>
                </View>
              </View>

              <View style={s.userActions}>
                <Pressable style={[t.outlineButton, { flex: 1 }]} onPress={() => openUserModal(user)}>
                  <Text style={t.outlineText}>View Details</Text>
                </Pressable>
                <Pressable style={[t.outlineButton, { flex: 1 }]} onPress={() => handleResetPassword(user)}>
                  <Text style={t.outlineText}>Reset Password</Text>
                </Pressable>
                <Pressable style={[t.dangerButton, { flex: 1 }]} onPress={() => handleDelete(user)}>
                  <Text style={t.dangerText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={!!selectedUser}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeUserModal}
      >
        {selectedUser && (
          <SafeAreaView style={t.screen}>
            <View style={s.modalHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.modalTitle}>User Details</Text>
                <Text style={t.subtitle} numberOfLines={1}>{selectedUser.email}</Text>
              </View>
              <Pressable style={t.outlineButton} onPress={closeUserModal}>
                <Text style={t.outlineText}>Close</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={[t.content, { paddingTop: 8 }]}>
              <View style={t.card}>
                <Text style={s.sectionTitle}>Profile</Text>
                <View style={s.infoGrid}>
                  <InfoCell label="Name" value={selectedUser.name || "-"} />
                  <InfoCell label="Email" value={selectedUser.email} />
                  <InfoCell label="Phone" value={selectedUser.phone || "-"} />
                  <InfoCell label="Farm" value={selectedUser.farmName || "-"} />
                  <InfoCell label="Updated" value={new Date(selectedUser.updatedAt).toLocaleString()} />
                  <InfoCell label="Sheet Total" value={String(selectedUser.sheetTotal)} />
                </View>
              </View>

              <View style={t.card}>
                <Text style={s.sectionTitle}>Customers ({selectedUser.customerCount})</Text>
                {selectedUser.customers.length === 0 ? (
                  <Text style={s.emptyText}>No customers saved.</Text>
                ) : (
                  groupCustomersByName(selectedUser.customers).map((group, idx) => {
                    const customer = group[0];
                    return (
                      <View key={`${selectedUser.email}-c-${customer.serialNumber}`} style={s.customerCard}>
                        <View style={s.customerRow}>
                          <Text style={s.customerName}>{customer.name || "Unnamed"}</Text>
                          <View style={{ flexDirection: "row", gap: 6 }}>
                            <View style={s.customerBadge}>
                              <Text style={s.customerBadgeText}>#{idx + 1}</Text>
                            </View>
                            <View style={[s.customerBadge, { backgroundColor: "#d1fae5" }]}>
                              <Text style={[s.customerBadgeText, { color: "#047857" }]}>{formatShiftLabel(group)}</Text>
                            </View>
                          </View>
                        </View>
                        {!!customer.mobile && <Text style={s.customerMeta}>{customer.mobile}</Text>}
                        {!!customer.address && <Text style={s.customerMeta}>{customer.address}</Text>}
                      </View>
                    );
                  })
                )}
              </View>

              <View style={t.card}>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>Sheet Data</Text>
                  <Text style={s.sectionCount}>
                    {selectedUser.sheet.rows.length} rows · {selectedUser.sheet.dayCount} days
                  </Text>
                </View>
                <View style={s.historyActions}>
                  <Pressable
                    style={[t.outlineButton, { flex: 1 }, archiving && { opacity: 0.5 }]}
                    disabled={archiving}
                    onPress={() => handleArchiveToHistory(selectedUser)}
                  >
                    <Text style={t.outlineText}>{archiving ? "Saving..." : "Save to History"}</Text>
                  </Pressable>
                  <Pressable
                    style={[t.outlineButton, { flex: 1 }]}
                    onPress={() => handleToggleHistory(selectedUser.email)}
                  >
                    <Text style={t.outlineText}>{showHistory ? "Hide History" : "View History"}</Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <View>
                    <View style={[s.tableRow, s.tableHeaderRow]}>
                      <Text style={[s.tableCell, s.tableCellHeader, { width: 40 }]}>No</Text>
                      <Text style={[s.tableCell, s.tableCellHeader, { width: 120 }]}>Customer</Text>
                      {Array.from({ length: selectedUser.sheet.dayCount }, (_, i) => (
                        <Text key={`hd-${i}`} style={[s.tableCell, s.tableCellHeader, { width: 48 }]}>
                          D{i + 1}
                        </Text>
                      ))}
                      <Text style={[s.tableCell, s.tableCellHeader, { width: 64 }]}>Total</Text>
                    </View>
                    {(() => {
                      const groupStartIndices = buildGroupStartIndices(selectedUser.sheet.rows);
                      const nameCellSpans = buildNameCellSpans(groupStartIndices);
                      const combinedTotals = buildCombinedTotals(selectedUser.sheet.rows, groupStartIndices);

                      return selectedUser.sheet.rows.map((row, ri) => {
                        const rowTotal = row.days.reduce((sum, v) => sum + (v || 0), 0);
                        const nameSpan = nameCellSpans[ri];
                        const isMergedAway = nameSpan === 0;
                        const displayTotal = nameSpan > 1 ? combinedTotals[ri] : rowTotal;

                        return (
                          <View key={`row-${ri}`} style={[s.tableRow, ri % 2 === 1 && s.tableRowAlt]}>
                            <Text style={[s.tableCell, { width: 40 }]}>{row.serialNumber}</Text>
                            <Text style={[s.tableCell, { width: 120 }]} numberOfLines={1}>
                              {isMergedAway ? "" : row.customerName || "-"}
                            </Text>
                            {row.days.map((v, di) => (
                              <Text key={`d-${di}`} style={[s.tableCell, { width: 48 }]}>{v || 0}</Text>
                            ))}
                            <Text style={[s.tableCell, s.tableCellBold, { width: 64 }]}>
                              {isMergedAway ? "" : displayTotal}
                            </Text>
                          </View>
                        );
                      });
                    })()}
                  </View>
                </ScrollView>
              </View>

              {showHistory && (
                <View style={t.card}>
                  <Text style={s.sectionTitle}>Saved History</Text>
                  {historyLoading ? (
                    <View style={{ paddingVertical: 16, alignItems: "center" }}>
                      <ActivityIndicator color={colors.primary} />
                    </View>
                  ) : historyEntries.length === 0 ? (
                    <Text style={s.emptyText}>No saved sheets yet for this user.</Text>
                  ) : (
                    <View style={{ gap: 8, marginTop: 8 }}>
                      {historyEntries.map((entry, index) => {
                        const entryTotal = entry.rows.reduce(
                          (sum, row) => sum + row.days.reduce((rowSum, v) => rowSum + (v || 0), 0),
                          0
                        );
                        const isExpanded = expandedEntryId === entry.id;

                        return (
                          <View key={entry.id} style={s.historyEntry}>
                            <Pressable onPress={() => setExpandedEntryId(isExpanded ? null : entry.id)}>
                              <View style={s.historyEntryHeader}>
                                <Text style={s.historyEntryTitle}>Sheet {historyEntries.length - index}</Text>
                                <Text style={s.metaText}>{formatDate(entry.savedAt)}</Text>
                              </View>
                              <Text style={s.metaText}>
                                {entry.rows.length} rows · {entry.dayCount} days · Total {entryTotal}
                              </Text>
                            </Pressable>

                            <View style={s.historyEntryActions}>
                              <Pressable
                                style={[t.outlineButton, { flex: 1 }]}
                                onPress={() => handleSaveHistoryToDevice(entry, selectedUser.name || selectedUser.email)}
                              >
                                <Text style={t.outlineText}>Save as PDF</Text>
                              </Pressable>
                              <Pressable
                                style={[t.dangerButton, { flex: 1 }]}
                                onPress={() => handleDeleteHistoryEntry(selectedUser.email, entry)}
                              >
                                <Text style={t.dangerText}>Delete</Text>
                              </Pressable>
                            </View>

                            {isExpanded && (
                              <ScrollView horizontal showsHorizontalScrollIndicator style={{ marginTop: 8 }}>
                                <View>
                                  <View style={[s.tableRow, s.tableHeaderRow]}>
                                    <Text style={[s.tableCell, s.tableCellHeader, { width: 40 }]}>No</Text>
                                    <Text style={[s.tableCell, s.tableCellHeader, { width: 120 }]}>Customer</Text>
                                    {Array.from({ length: entry.dayCount }, (_, i) => (
                                      <Text key={`hist-${entry.id}-hd-${i}`} style={[s.tableCell, s.tableCellHeader, { width: 48 }]}>
                                        D{i + 1}
                                      </Text>
                                    ))}
                                    <Text style={[s.tableCell, s.tableCellHeader, { width: 64 }]}>Total</Text>
                                  </View>
                                  {(() => {
                                    const groupStartIndices = buildGroupStartIndices(entry.rows);
                                    const nameCellSpans = buildNameCellSpans(groupStartIndices);
                                    const combinedTotals = buildCombinedTotals(entry.rows, groupStartIndices);
                                    const displaySerialNumbers = buildDisplaySerialMap(entry.rows);

                                    return entry.rows.map((row, ri) => {
                                      const rowTotal = row.days.reduce((sum, v) => sum + (v || 0), 0);
                                      const nameSpan = nameCellSpans[ri];
                                      const isMergedAway = nameSpan === 0;
                                      const displayTotal = nameSpan > 1 ? combinedTotals[ri] : rowTotal;

                                      return (
                                        <View key={`hist-${entry.id}-row-${ri}`} style={[s.tableRow, ri % 2 === 1 && s.tableRowAlt]}>
                                          <Text style={[s.tableCell, { width: 40 }]}>{displaySerialNumbers[ri]}</Text>
                                          <Text style={[s.tableCell, { width: 120 }]} numberOfLines={1}>
                                            {isMergedAway ? "" : row.customerName || "-"}
                                          </Text>
                                          {row.days.map((v, di) => (
                                            <Text key={`hist-${entry.id}-d-${ri}-${di}`} style={[s.tableCell, { width: 48 }]}>{v || 0}</Text>
                                          ))}
                                          <Text style={[s.tableCell, s.tableCellBold, { width: 64 }]}>
                                            {isMergedAway ? "" : displayTotal}
                                          </Text>
                                        </View>
                                      );
                                    });
                                  })()}
                                </View>
                              </ScrollView>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              <View style={t.card}>
                <Text style={s.sectionTitle}>Edit Profile (Owner)</Text>
                <View style={{ gap: 10, marginTop: 10 }}>
                  <TextInput
                    style={t.input}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Full name"
                    placeholderTextColor={colors.muted}
                  />
                  <TextInput
                    style={t.input}
                    value={editPhone}
                    onChangeText={setEditPhone}
                    placeholder="Phone"
                    placeholderTextColor={colors.muted}
                    keyboardType="phone-pad"
                  />
                  <TextInput
                    style={t.input}
                    value={editEmail}
                    onChangeText={setEditEmail}
                    placeholder="Email"
                    placeholderTextColor={colors.muted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <Pressable
                    style={[t.button, savingProfile && { opacity: 0.6 }]}
                    onPress={() => handleSaveProfile(selectedUser)}
                    disabled={savingProfile}
                  >
                    <Text style={t.buttonText}>{savingProfile ? "Saving..." : "Save"}</Text>
                  </Pressable>
                </View>
              </View>

              <Pressable style={t.outlineButton} onPress={() => handleResetPassword(selectedUser)}>
                <Text style={t.outlineText}>Send Password Reset Email</Text>
              </Pressable>
              <Pressable style={t.dangerButton} onPress={() => handleDelete(selectedUser)}>
                <Text style={t.dangerText}>Delete This User</Text>
              </Pressable>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

function StatCard({ label, value, color, small }: { label: string; value: string; color: string; small?: boolean }) {
  return (
    <View style={[s.statCard, { flex: 1 }]}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, { color, fontSize: small ? 16 : 22 }]}>{value}</Text>
    </View>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoCell}>
      <Text style={s.infoCellLabel}>{label}</Text>
      <Text style={s.infoCellValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  statsRow: { flexDirection: "row", gap: 10 },
  historyActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  historyEntry: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10
  },
  historyEntryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  historyEntryTitle: { color: colors.foreground, fontSize: 13, fontWeight: "700" },
  historyEntryActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  statCard: {
    backgroundColor: "#ffffff",
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14
  },
  statLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  statValue: { fontWeight: "700", marginTop: 6 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  sectionTitle: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
  sectionCount: { color: colors.muted, fontSize: 12 },
  emptyText: { color: colors.muted, fontSize: 13, textAlign: "center", paddingVertical: 16 },
  userCard: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  userHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 999,
    flexShrink: 0,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  avatarText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  userName: { color: colors.foreground, flex: 1, fontSize: 14, fontWeight: "700" },
  roleBadge: { backgroundColor: "#dbeafe", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  roleBadgeText: { color: "#1d4ed8", fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  userEmail: { color: colors.muted, fontSize: 12, marginTop: 1 },
  userMeta: { gap: 2 },
  metaText: { color: colors.muted, fontSize: 12 },
  userStats: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    padding: 10
  },
  userStat: { flex: 1, alignItems: "center" },
  userStatLabel: { color: colors.muted, fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  userStatValue: { color: colors.foreground, fontSize: 18, fontWeight: "700", marginTop: 2 },
  userActions: { flexDirection: "row", gap: 8 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  modalTitle: { color: colors.foreground, fontSize: 18, fontWeight: "700" },
  infoGrid: { gap: 8 },
  infoCell: { backgroundColor: colors.background, borderRadius: 8, padding: 10 },
  infoCellLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4
  },
  infoCellValue: { color: colors.foreground, fontSize: 14, fontWeight: "600", marginTop: 2 },
  customerCard: { backgroundColor: colors.background, borderRadius: 8, gap: 3, padding: 10 },
  customerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  customerName: { color: colors.foreground, flex: 1, fontSize: 14, fontWeight: "600" },
  customerBadge: { backgroundColor: "#dbeafe", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  customerBadgeText: { color: "#1d4ed8", fontSize: 10, fontWeight: "700" },
  customerMeta: { color: colors.muted, fontSize: 12 },
  tableRow: { flexDirection: "row" },
  tableHeaderRow: { backgroundColor: "#f1f5f9" },
  tableRowAlt: { backgroundColor: "#f8fafc" },
  tableCell: { borderColor: colors.border, borderWidth: 1, color: colors.foreground, fontSize: 12, padding: 8 },
  tableCellHeader: { color: "#334155", fontWeight: "700" },
  tableCellBold: { fontWeight: "700" }
});
