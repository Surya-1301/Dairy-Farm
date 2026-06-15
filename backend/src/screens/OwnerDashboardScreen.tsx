import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  fetchUserProfiles,
  deleteUserProfile
} from "../firebase";
import { colors } from "../theme";
import type { UserProfile } from "../types";

export default function OwnerDashboardScreen() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const nextUsers = await fetchUserProfiles();
      setUsers(nextUsers);
    } catch (error) {
      Alert.alert("Error", "Failed to load users");
      console.error("Error loading users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadUsers();
    setRefreshing(false);
  };

  const deleteUser = (user: UserProfile) => {
    Alert.alert("Delete User", `Are you sure you want to delete ${user.email}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteUserProfile(user.email);
            setUsers(users.filter((u) => u.email !== user.email));
            Alert.alert("Success", "User deleted");
          } catch (error) {
            Alert.alert("Error", "Failed to delete user");
          }
        }
      }
    ]);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={undefined}
        onScroll={undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Owner Dashboard</Text>
          <Text style={styles.subtitle}>Manage registered users</Text>
        </View>

        <View style={styles.statsContainer}>
          <StatCard label="Total Users" value={users.length.toString()} />
          <StatCard label="Active" value={(users.length > 0 ? users.length : 0).toString()} />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Registered Users ({users.length})</Text>
            <Pressable onPress={handleRefresh} disabled={refreshing}>
              <Text style={styles.refreshButton}>{refreshing ? "..." : "↻"}</Text>
            </Pressable>
          </View>

          {users.length === 0 ? (
            <Text style={styles.emptyText}>No users registered yet</Text>
          ) : (
            users.map((user) => (
              <View key={user.email} style={styles.userCard}>
                <View style={styles.userHeader}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {(user.name || user.email || "U").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{user.name || user.email}</Text>
                    <Text style={styles.userEmail}>{user.email}</Text>
                  </View>
                </View>

                <View style={styles.userInfo}>
                  {user.phone && (
                    <Text style={styles.userMeta}>📞 {user.phone}</Text>
                  )}
                  {user.farmName && (
                    <Text style={styles.userMeta}>🏗️ {user.farmName}</Text>
                  )}
                  <Text style={styles.userMeta}>
                    📅 {new Date(user.updatedAt).toLocaleDateString()}
                  </Text>
                </View>

                <Pressable
                  style={[styles.deleteButton]}
                  onPress={() => deleteUser(user)}
                >
                  <Text style={styles.deleteButtonText}>Delete User</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1
  },
  content: {
    padding: 16,
    gap: 16
  },
  header: {
    marginBottom: 8
  },
  title: {
    color: colors.foreground,
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14
  },
  statsContainer: {
    flexDirection: "row",
    gap: 12
  },
  statCard: {
    backgroundColor: "#ffffff",
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    padding: 16
  },
  statLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600"
  },
  statValue: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: "700",
    marginTop: 8
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 12
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12
  },
  cardTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "700"
  },
  refreshButton: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: "700"
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 20
  },
  userCard: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    gap: 12,
    padding: 12,
    marginBottom: 12
  },
  userHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700"
  },
  userName: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "700"
  },
  userEmail: {
    color: colors.muted,
    fontSize: 12
  },
  userInfo: {
    gap: 4
  },
  userMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16
  },
  deleteButton: {
    alignItems: "center",
    backgroundColor: "#ef4444",
    borderRadius: 6,
    paddingVertical: 8
  },
  deleteButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700"
  }
});
