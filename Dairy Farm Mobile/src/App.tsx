import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  auth,
  deleteUserProfile,
  fetchUserProfiles,
  getActiveUserFromFirebase,
  logout,
  resetPassword,
  signIn,
  signUp,
  subscribeFirebaseAuth,
  updateProfileForCurrentUser
} from "./firebase";
import {
  archiveSheet,
  createInitialSheet,
  deleteSheetRow,
  getCustomers,
  getHistory,
  getSheet,
  saveCustomers,
  saveSheet,
  syncSheetCustomerNames
} from "./storage";
import { colors, styles as s } from "./theme";
import type { ActiveUser, Customer, SheetHistoryEntry, SheetState, TabKey, UserProfile } from "./types";

const logo = require("../assets/logo.png");

type AuthMode = "signin" | "signup" | "reset";

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  multiline
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad" | "numeric" | "decimal-pad";
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        autoCapitalize="none"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        multiline={multiline}
        style={[s.input, multiline ? { minHeight: 92, textAlignVertical: "top" } : null]}
      />
    </View>
  );
}

function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "outline" | "danger";
  disabled?: boolean;
}) {
  const buttonStyle = variant === "primary" ? s.button : variant === "danger" ? s.dangerButton : s.outlineButton;
  const textStyle = variant === "primary" ? s.buttonText : variant === "danger" ? s.dangerText : s.outlineText;

  return (
    <Pressable onPress={onPress} disabled={disabled} style={[buttonStyle, disabled ? { opacity: 0.5 } : null]}>
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
}

function LoginScreen() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Use your email address and password to access the app.");

  const submit = async () => {
    setLoading(true);
    try {
      if (mode === "signup") {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }
        await signUp(email, password, name);
      } else if (mode === "reset") {
        await resetPassword(email);
        setMessage("Password reset email sent. Check your inbox and sign in.");
        setMode("signin");
      } else {
        await signIn(email, password);
      }
    } catch (error) {
      Alert.alert("Authentication failed", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setMessage("Use your email address and password to access the app.");
  };

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[s.content, { flexGrow: 1, justifyContent: "center" }]}>
          <View style={[s.card, { gap: 16 }]}>
            <View style={[s.row, { gap: 12 }]}>
              <Image source={logo} style={local.logo} />
              <View>
                <Text style={s.title}>Dairy Farm</Text>
                <Text style={s.subtitle}>Raipur Dairy Management</Text>
              </View>
            </View>

            <View style={local.segment}>
              <Pressable style={[local.segmentItem, mode === "signin" ? local.segmentActive : null]} onPress={() => switchMode("signin")}>
                <Text style={local.segmentText}>Sign in</Text>
              </Pressable>
              <Pressable style={[local.segmentItem, mode === "signup" ? local.segmentActive : null]} onPress={() => switchMode("signup")}>
                <Text style={local.segmentText}>Sign up</Text>
              </Pressable>
            </View>

            <Text style={s.subtitle}>{message}</Text>

            {mode === "signup" ? <Field label="Full Name" value={name} onChangeText={setName} placeholder="Enter your name" /> : null}
            <Field label="Email Address" value={email} onChangeText={setEmail} placeholder="Enter email" keyboardType="email-address" />
            {mode !== "reset" ? (
              <Field label="Password" value={password} onChangeText={setPassword} placeholder="Enter password" secureTextEntry />
            ) : null}
            {mode === "signup" ? (
              <Field label="Confirm Password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm password" secureTextEntry />
            ) : null}

            <Button
              label={loading ? "Please wait..." : mode === "reset" ? "Send reset link" : mode === "signup" ? "Create account" : "Sign in"}
              onPress={submit}
              disabled={loading}
            />
            {mode === "signin" ? <Button label="Forgot password?" onPress={() => switchMode("reset")} variant="outline" /> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Header({ activeUser, onLogout }: { activeUser: ActiveUser; onLogout: () => void }) {
  return (
    <View style={local.header}>
      <View style={[s.row, { gap: 10, flex: 1 }]}>
        <Image source={logo} style={local.headerLogo} />
        <View style={{ flex: 1 }}>
          <Text style={local.headerTitle}>Dairy Farm</Text>
          <Text style={local.headerSub}>{activeUser.email}</Text>
        </View>
      </View>
      <Pressable onPress={onLogout} style={local.logout}>
        <Text style={local.logoutText}>Logout</Text>
      </Pressable>
    </View>
  );
}

function Tabs({ active, setActive, isOwner }: { active: TabKey; setActive: (tab: TabKey) => void; isOwner: boolean }) {
  const tabs: Array<{ key: TabKey; label: string }> = isOwner
    ? [
        { key: "owner", label: "Owner" },
        { key: "profile", label: "Profile" }
      ]
    : [
        { key: "dashboard", label: "Dashboard" },
        { key: "customers", label: "Customers" },
        { key: "data", label: "Data" },
        { key: "history", label: "History" },
        { key: "profile", label: "Profile" }
      ];

  return (
    <View style={local.tabs}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {tabs.map((tab) => (
          <Pressable key={tab.key} onPress={() => setActive(tab.key)} style={[local.tab, active === tab.key ? local.tabActive : null]}>
            <Text style={[local.tabText, active === tab.key ? local.tabTextActive : null]}>{tab.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function DashboardScreen({ refreshSignal }: { refreshSignal: number }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sheet, setSheet] = useState<SheetState>(createInitialSheet());

  useEffect(() => {
    Promise.all([getCustomers(), getSheet()]).then(([nextCustomers, nextSheet]) => {
      setCustomers(nextCustomers);
      setSheet(nextSheet);
    });
  }, [refreshSignal]);

  const totalMilk = sheet.rows.reduce((sum, row) => sum + row.days.reduce((rowSum, value) => rowSum + value, 0), 0);

  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>Dashboard</Text>
      <View style={local.metrics}>
        <Metric label="Customers" value={`${customers.length}`} />
        <Metric label="Total Milk" value={`${totalMilk.toFixed(1)} L`} />
        <Metric label="Days" value={`${sheet.dayCount}`} />
      </View>
      <View style={s.card}>
        <Text style={local.cardTitle}>Daily Milk</Text>
        {Array.from({ length: sheet.dayCount }, (_, dayIndex) => {
          const liters = sheet.rows.reduce((sum, row) => sum + (row.days[dayIndex] ?? 0), 0);
          return (
            <View key={dayIndex} style={local.listRow}>
              <Text style={s.cellText}>Day {dayIndex + 1}</Text>
              <Text style={[s.cellText, { fontWeight: "800" }]}>{liters.toFixed(1)} L</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={local.metric}>
      <Text style={local.metricLabel}>{label}</Text>
      <Text style={local.metricValue}>{value}</Text>
    </View>
  );
}

function CustomersScreen({ onChanged }: { onChanged: () => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState("");

  const load = async () => setCustomers(await getCustomers());

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setEditing(null);
    setName("");
    setMobile("");
    setAddress("");
  };

  const save = async () => {
    if (!name.trim() || !mobile.trim() || !address.trim()) {
      Alert.alert("Missing details", "Please fill all customer fields.");
      return;
    }

    let nextCustomers: Customer[];
    if (editing) {
      nextCustomers = customers.map((customer) =>
        customer.serialNumber === editing.serialNumber ? { ...customer, name, mobile, address } : customer
      );
    } else {
      nextCustomers = [
        ...customers,
        {
          serialNumber: customers.length + 1,
          name,
          mobile,
          address,
          createdAt: new Date().toISOString()
        }
      ];
    }

    const saved = await saveCustomers(nextCustomers);
    await syncSheetCustomerNames(saved);
    setCustomers(saved);
    resetForm();
    onChanged();
  };

  const edit = (customer: Customer) => {
    setEditing(customer);
    setName(customer.name);
    setMobile(customer.mobile);
    setAddress(customer.address);
  };

  const remove = (customer: Customer) => {
    Alert.alert("Delete customer", `Delete ${customer.name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const saved = await saveCustomers(customers.filter((item) => item.serialNumber !== customer.serialNumber));
          await deleteSheetRow(customer.serialNumber);
          setCustomers(saved);
          onChanged();
        }
      }
    ]);
  };

  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>Add Customer</Text>
      <View style={s.card}>
        <Text style={local.cardTitle}>{editing ? "Edit Customer" : "Add New Customer"}</Text>
        <Field label="Customer Name" value={name} onChangeText={setName} placeholder="Enter customer name" />
        <Field label="Mobile Number" value={mobile} onChangeText={setMobile} placeholder="Enter mobile number" keyboardType="phone-pad" />
        <Field label="Address" value={address} onChangeText={setAddress} placeholder="Enter address" multiline />
        <View style={{ gap: 10 }}>
          <Button label={editing ? "Update Customer" : "Add Customer"} onPress={save} />
          {editing ? <Button label="Cancel" onPress={resetForm} variant="outline" /> : null}
        </View>
      </View>

      {customers.map((customer) => (
        <View key={customer.serialNumber} style={s.card}>
          <Text style={local.cardTitle}>
            {customer.serialNumber}. {customer.name}
          </Text>
          <Text style={s.subtitle}>{customer.mobile}</Text>
          <Text style={s.subtitle}>{customer.address}</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button label="Edit" onPress={() => edit(customer)} variant="outline" />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Delete" onPress={() => remove(customer)} variant="danger" />
            </View>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function DataScreen({ onChanged }: { onChanged: () => void }) {
  const [sheet, setSheet] = useState<SheetState>(createInitialSheet());

  const load = async () => setSheet(await getSheet());

  useEffect(() => {
    load();
  }, []);

  const persist = async (nextSheet: SheetState) => {
    setSheet(nextSheet);
    await saveSheet(nextSheet);
    onChanged();
  };

  const updateCustomerName = (serialNumber: number, customerName: string) => {
    void persist({
      ...sheet,
      rows: sheet.rows.map((row) => (row.serialNumber === serialNumber ? { ...row, customerName } : row))
    });
  };

  const updateDayValue = (serialNumber: number, dayIndex: number, value: string) => {
    const parsedValue = Number(value);
    const safeValue = Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 0;
    const rows = sheet.rows.map((row) => {
      if (row.serialNumber !== serialNumber) {
        return row;
      }
      const days = [...row.days];
      days[dayIndex] = safeValue;
      return { ...row, days };
    });
    void persist({ ...sheet, rows });
  };

  const addRow = () => {
    void persist({
      ...sheet,
      rows: [
        ...sheet.rows,
        {
          serialNumber: sheet.rows.length + 1,
          customerName: "",
          days: Array.from({ length: sheet.dayCount }, () => 0)
        }
      ]
    });
  };

  const removeRow = () => {
    if (sheet.rows.length <= 1) {
      return;
    }
    void persist({ ...sheet, rows: sheet.rows.slice(0, -1).map((row, index) => ({ ...row, serialNumber: index + 1 })) });
  };

  const addColumn = () => {
    void persist({
      dayCount: sheet.dayCount + 1,
      rows: sheet.rows.map((row) => ({ ...row, days: [...row.days, 0] }))
    });
  };

  const removeColumn = () => {
    if (sheet.dayCount <= 1) {
      return;
    }
    void persist({
      dayCount: sheet.dayCount - 1,
      rows: sheet.rows.map((row) => ({ ...row, days: row.days.slice(0, -1) }))
    });
  };

  const saveHistory = async () => {
    const nextSheet = await archiveSheet(sheet);
    setSheet(nextSheet);
    onChanged();
    Alert.alert("Saved", "Milk sheet saved to history.");
  };

  return (
    <ScrollView contentContainerStyle={s.content}>
      <View>
        <Text style={s.title}>Data</Text>
        <Text style={s.subtitle}>Open and manage the milk sheet here.</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Button label="Add Row" onPress={addRow} />
        <Button label="Remove Row" onPress={removeRow} variant="danger" disabled={sheet.rows.length <= 1} />
        <Button label="Add Column" onPress={addColumn} />
        <Button label="Remove Column" onPress={removeColumn} variant="danger" disabled={sheet.dayCount <= 1} />
        <Button label="Save History" onPress={saveHistory} variant="outline" />
      </View>
      <ScrollView horizontal>
        <View>
          <View style={[s.row, s.tableHeader]}>
            <TableCell width={64} text="S No" bold />
            <TableCell width={150} text="Customer" bold />
            {Array.from({ length: sheet.dayCount }, (_, index) => (
              <TableCell key={index} width={90} text={`Day ${index + 1}`} bold />
            ))}
            <TableCell width={90} text="Total" bold />
          </View>
          {sheet.rows.map((row) => {
            const total = row.days.reduce((sum, value) => sum + value, 0);
            return (
              <View key={row.serialNumber} style={s.row}>
                <TableCell width={64} text={`${row.serialNumber}`} />
                <View style={[s.cell, { width: 150 }]}>
                  <TextInput value={row.customerName} onChangeText={(value) => updateCustomerName(row.serialNumber, value)} style={local.tableInput} />
                </View>
                {row.days.map((value, dayIndex) => (
                  <View key={`${row.serialNumber}-${dayIndex}`} style={[s.cell, { width: 90 }]}>
                    <TextInput
                      value={value === 0 ? "" : String(value)}
                      onChangeText={(nextValue) => updateDayValue(row.serialNumber, dayIndex, nextValue)}
                      keyboardType="decimal-pad"
                      style={[local.tableInput, { textAlign: "center" }]}
                    />
                  </View>
                ))}
                <TableCell width={90} text={`${total}`} bold />
              </View>
            );
          })}
        </View>
      </ScrollView>
    </ScrollView>
  );
}

function TableCell({ text, width, bold }: { text: string; width: number; bold?: boolean }) {
  return (
    <View style={[s.cell, { width }]}>
      <Text style={[s.cellText, bold ? { fontWeight: "800" } : null]}>{text}</Text>
    </View>
  );
}

function HistoryScreen({ refreshSignal }: { refreshSignal: number }) {
  const [history, setHistory] = useState<SheetHistoryEntry[]>([]);

  useEffect(() => {
    getHistory().then(setHistory);
  }, [refreshSignal]);

  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>History</Text>
      {history.length === 0 ? <Text style={s.subtitle}>No saved sheets yet.</Text> : null}
      {history.map((entry) => {
        const total = entry.rows.reduce((sum, row) => sum + row.days.reduce((rowSum, value) => rowSum + value, 0), 0);
        return (
          <View key={entry.id} style={s.card}>
            <Text style={local.cardTitle}>{new Date(entry.savedAt).toLocaleString()}</Text>
            <Text style={s.subtitle}>
              {entry.rows.length} rows · {entry.dayCount} days · Total {total.toFixed(1)} L
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

function ProfileScreen({ activeUser, onChanged }: { activeUser: ActiveUser; onChanged: () => void }) {
  const [name, setName] = useState(activeUser.role === "owner" ? "Owner" : activeUser.email.split("@")[0]);
  const [email] = useState(activeUser.email);
  const [phone, setPhone] = useState(activeUser.phone);
  const [farmName, setFarmName] = useState(activeUser.role === "owner" ? "Raipur Dairy Farm" : "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateProfileForCurrentUser({ name, email, phone, farmName });
      onChanged();
      Alert.alert("Saved", "Profile updated.");
    } catch (error) {
      Alert.alert("Could not save", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>Profile</Text>
      <View style={s.card}>
        <Field label="Name" value={name} onChangeText={setName} />
        <Field label="Email" value={email} onChangeText={() => undefined} keyboardType="email-address" />
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Field label="Farm Name" value={farmName} onChangeText={setFarmName} />
        <Button label={saving ? "Saving..." : "Save Profile"} onPress={save} disabled={saving} />
      </View>
    </ScrollView>
  );
}

function OwnerDashboardScreen({ refreshSignal }: { refreshSignal: number }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setUsers(await fetchUserProfiles());
    } catch (error) {
      Alert.alert("Could not load users", error instanceof Error ? error.message : "Check Firestore rules.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [refreshSignal]);

  const remove = (profile: UserProfile) => {
    Alert.alert("Delete profile", `Remove ${profile.email} from owner dashboard?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteUserProfile(profile.email);
          await load();
        }
      }
    ]);
  };

  return (
    <ScrollView contentContainerStyle={s.content}>
      <View style={[s.row, { justifyContent: "space-between", gap: 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Owner Dashboard</Text>
          <Text style={s.subtitle}>System Overview & Management</Text>
        </View>
        <Button label={loading ? "Loading..." : "Refresh"} onPress={load} disabled={loading} />
      </View>
      <View style={local.metrics}>
        <Metric label="Total Users" value={`${users.length}`} />
        <Metric label="Total Milk" value="0.0 L" />
        <Metric label="Earnings" value="₹0" />
      </View>
      <Text style={local.cardTitle}>Registered Users</Text>
      {users.length === 0 ? <Text style={s.subtitle}>No users registered yet.</Text> : null}
      {users.map((user) => (
        <View key={user.email} style={s.card}>
          <Text style={local.cardTitle}>{user.name || user.email}</Text>
          <Text style={s.subtitle}>{user.email}</Text>
          <Text style={s.subtitle}>{user.phone || "-"}</Text>
          <Text style={s.subtitle}>{user.farmName || "-"}</Text>
          <Button label="Delete" onPress={() => remove(user)} variant="danger" />
        </View>
      ))}
    </ScrollView>
  );
}

function MainApp({ activeUser }: { activeUser: ActiveUser }) {
  const [activeTab, setActiveTab] = useState<TabKey>(activeUser.role === "owner" ? "owner" : "dashboard");
  const [refreshSignal, setRefreshSignal] = useState(0);
  const bumpRefresh = () => setRefreshSignal((value) => value + 1);

  const content = useMemo(() => {
    switch (activeTab) {
      case "customers":
        return <CustomersScreen onChanged={bumpRefresh} />;
      case "data":
        return <DataScreen onChanged={bumpRefresh} />;
      case "history":
        return <HistoryScreen refreshSignal={refreshSignal} />;
      case "profile":
        return <ProfileScreen activeUser={activeUser} onChanged={bumpRefresh} />;
      case "owner":
        return <OwnerDashboardScreen refreshSignal={refreshSignal} />;
      default:
        return <DashboardScreen refreshSignal={refreshSignal} />;
    }
  }, [activeTab, activeUser, refreshSignal]);

  return (
    <SafeAreaView style={s.screen}>
      <Header
        activeUser={activeUser}
        onLogout={() => {
          void logout();
        }}
      />
      <Tabs active={activeTab} setActive={setActiveTab} isOwner={activeUser.role === "owner"} />
      <View style={{ flex: 1 }}>{content}</View>
    </SafeAreaView>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [activeUser, setActiveUser] = useState<ActiveUser | null>(getActiveUserFromFirebase(auth.currentUser));

  useEffect(() => {
    return subscribeFirebaseAuth((user) => {
      setActiveUser(getActiveUserFromFirebase(user));
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={[s.screen, { alignItems: "center", justifyContent: "center" }]}>
          <StatusBar style="dark" />
          <Image source={logo} style={local.logo} />
          <Text style={[s.subtitle, { marginTop: 12 }]}>Checking account session...</Text>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {activeUser ? <MainApp activeUser={activeUser} /> : <LoginScreen />}
    </SafeAreaProvider>
  );
}

const local = StyleSheet.create({
  logo: {
    borderColor: colors.softLine,
    borderRadius: 34,
    borderWidth: 1,
    height: 68,
    width: 68
  },
  header: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderBottomColor: colors.softLine,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14
  },
  headerLogo: {
    borderColor: colors.softLine,
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    width: 48
  },
  headerTitle: {
    color: colors.brandDark,
    fontSize: 20,
    fontWeight: "900"
  },
  headerSub: {
    color: colors.muted,
    fontSize: 11
  },
  logout: {
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  logoutText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800"
  },
  segment: {
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    flexDirection: "row",
    gap: 4,
    padding: 4
  },
  segmentItem: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    padding: 10
  },
  segmentActive: {
    backgroundColor: "#ffffff"
  },
  segmentText: {
    color: colors.text,
    fontWeight: "800"
  },
  tabs: {
    backgroundColor: "#ffffff",
    borderBottomColor: colors.softLine,
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  tab: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  tabActive: {
    backgroundColor: colors.brand
  },
  tabText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800"
  },
  tabTextActive: {
    color: "#ffffff"
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  metric: {
    backgroundColor: "#ffffff",
    borderColor: colors.softLine,
    borderRadius: 10,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 120,
    padding: 14
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  metricValue: {
    color: colors.brandDark,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 6
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900"
  },
  listRow: {
    alignItems: "center",
    borderBottomColor: colors.softLine,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10
  },
  tableInput: {
    color: colors.text,
    fontSize: 13,
    minHeight: 32,
    padding: 0
  }
});
