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
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { deleteUserProfile, fetchUserProfiles, resetPassword } from "../firebase";
import { getCustomersByEmail, getSheetByEmail } from "../storage";
import { colors, styles as t } from "../theme";
import type { Customer, SheetState, UserProfile } from "../types";

type UserSnapshot = UserProfile & {
  customers: Customer[];
  sheet: SheetState;
  customerCount: number;
  sheetTotal: number;
};

export default function OwnerDashboardScreen() {
  const [snapshots, setSnapshots] = useState<UserSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSnapshot | null>(null);

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
              if (selectedUser?.email === user.email) setSelectedUser(null);
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
                <Pressable style={[t.outlineButton, { flex: 1 }]} onPress={() => setSelectedUser(user)}>
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
        onRequestClose={() => setSelectedUser(null)}
      >
        {selectedUser && (
          <SafeAreaView style={t.screen}>
            <View style={s.modalHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.modalTitle}>User Details</Text>
                <Text style={t.subtitle} numberOfLines={1}>{selectedUser.email}</Text>
              </View>
              <Pressable style={t.outlineButton} onPress={() => setSelectedUser(null)}>
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
                  selectedUser.customers.map((customer) => (
                    <View key={`${selectedUser.email}-c-${customer.serialNumber}`} style={s.customerCard}>
                      <View style={s.customerRow}>
                        <Text style={s.customerName}>{customer.name || "Unnamed"}</Text>
                        <View style={s.customerBadge}>
                          <Text style={s.customerBadgeText}>#{customer.serialNumber}</Text>
                        </View>
                      </View>
                      {!!customer.mobile && <Text style={s.customerMeta}>{customer.mobile}</Text>}
                      {!!customer.address && <Text style={s.customerMeta}>{customer.address}</Text>}
                    </View>
                  ))
                )}
              </View>

              <View style={t.card}>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>Sheet Data</Text>
                  <Text style={s.sectionCount}>
                    {selectedUser.sheet.rows.length} rows · {selectedUser.sheet.dayCount} days
                  </Text>
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
                    {selectedUser.sheet.rows.map((row, ri) => {
                      const rowTotal = row.days.reduce((sum, v) => sum + (v || 0), 0);
                      return (
                        <View key={`row-${ri}`} style={[s.tableRow, ri % 2 === 1 && s.tableRowAlt]}>
                          <Text style={[s.tableCell, { width: 40 }]}>{row.serialNumber}</Text>
                          <Text style={[s.tableCell, { width: 120 }]} numberOfLines={1}>
                            {row.customerName || "-"}
                          </Text>
                          {row.days.map((v, di) => (
                            <Text key={`d-${di}`} style={[s.tableCell, { width: 48 }]}>{v || 0}</Text>
                          ))}
                          <Text style={[s.tableCell, s.tableCellBold, { width: 64 }]}>{rowTotal}</Text>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
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
