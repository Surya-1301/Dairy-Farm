import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getCustomers, saveCustomers, syncSheetCustomerNames, deleteSheetRow } from "../storage";
import { colors, styles as t } from "../theme";
import type { Customer } from "../types";

const SHIFTS = [
  { label: "Morning (M)", value: "M" },
  { label: "Evening (E)", value: "E" },
  { label: "Both (M/E)", value: "M/E" },
];

const EMPTY_FORM = { name: "", mobile: "", address: "", shift: "" };

const S_NO_WIDTH = 52;
const NAME_WIDTH = 160;
const SHIFT_WIDTH = 72;
const MOBILE_WIDTH = 130;
const ADDRESS_WIDTH = 160;
const ACTIONS_WIDTH = 120;

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

  return group[0].shift || "—";
}

export default function CustomersScreen() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingSerials, setEditingSerials] = useState<number[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getCustomers();
      setCustomers(data);
    } catch {
      Alert.alert("Error", "Failed to load customers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleAddClick() {
    setEditingSerials([]);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function handleEditClick(group: Customer[]) {
    const [primary] = group;
    setEditingSerials(group.map((c) => c.serialNumber));
    setForm({
      name: primary.name,
      mobile: primary.mobile,
      address: primary.address,
      shift: group.length > 1 ? "M/E" : primary.shift ?? "",
    });
    setShowForm(true);
  }

  function handleCancel() {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setEditingSerials([]);
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      Alert.alert("Required", "Customer name is required.");
      return;
    }

    const name = form.name.trim();
    const mobile = form.mobile.trim();
    const address = form.address.trim();
    const isEditing = editingSerials.length > 0;

    setSaving(true);
    try {
      let updated: Customer[];

      if (form.shift === "M/E") {
        if (isEditing && editingSerials.length === 2) {
          const list = await getCustomers();
          const next = list.map((c) =>
            editingSerials.includes(c.serialNumber) ? { ...c, name, mobile, address } : c
          );
          updated = await saveCustomers(next);
        } else if (isEditing) {
          const list = await getCustomers();
          const idx = list.findIndex((c) => c.serialNumber === editingSerials[0]);
          if (idx !== -1) {
            list[idx] = { ...list[idx], name, mobile, address, shift: "M" };
          }
          const eCustomer: Customer = {
            serialNumber: list.length + 1,
            name,
            mobile,
            address,
            shift: "E",
            createdAt: new Date().toISOString(),
          };
          updated = await saveCustomers([...list, eCustomer]);
        } else {
          const list = await getCustomers();
          const mCustomer: Customer = {
            serialNumber: list.length + 1,
            name,
            mobile,
            address,
            shift: "M",
            createdAt: new Date().toISOString(),
          };
          const list2 = await saveCustomers([...list, mCustomer]);
          const eCustomer: Customer = {
            serialNumber: list2.length + 1,
            name,
            mobile,
            address,
            shift: "E",
            createdAt: new Date().toISOString(),
          };
          updated = await saveCustomers([...list2, eCustomer]);
        }
      } else if (isEditing && editingSerials.length === 2) {
        const list = await getCustomers();
        const candidates = editingSerials.map((sn) => list.find((c) => c.serialNumber === sn));
        let keepIndex = candidates.findIndex((c) => c?.shift === form.shift);
        if (keepIndex === -1) keepIndex = 0;
        const keepSerial = editingSerials[keepIndex];
        const removeSerial = editingSerials[1 - keepIndex];

        const next = list
          .filter((c) => c.serialNumber !== removeSerial)
          .map((c) => (c.serialNumber === keepSerial ? { ...c, name, mobile, address, shift: form.shift } : c));

        const [savedCustomers] = await Promise.all([saveCustomers(next), deleteSheetRow(removeSerial)]);
        updated = savedCustomers;
      } else if (isEditing) {
        const list = await getCustomers();
        const idx = list.findIndex((c) => c.serialNumber === editingSerials[0]);
        if (idx !== -1) {
          list[idx] = { ...list[idx], name, mobile, address, shift: form.shift };
        }
        updated = await saveCustomers(list);
      } else {
        const list = await getCustomers();
        const newCustomer: Customer = {
          serialNumber: list.length + 1,
          name,
          mobile,
          address,
          shift: form.shift,
          createdAt: new Date().toISOString(),
        };
        updated = await saveCustomers([...list, newCustomer]);
      }

      await syncSheetCustomerNames(updated);
      setCustomers(updated);
      setForm(EMPTY_FORM);
      setShowForm(false);
      setEditingSerials([]);
    } catch {
      Alert.alert("Error", "Failed to save customer.");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(group: Customer[]) {
    const isGroup = group.length > 1;
    Alert.alert(
      "Delete Customer",
      isGroup ? "Are you sure you want to delete this customer (both shifts)?" : "Are you sure you want to delete this customer?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setSaving(true);
            try {
              const serials = group.map((c) => c.serialNumber);
              const filteredCustomers = customers.filter((c) => !serials.includes(c.serialNumber));
              const [savedCustomers] = await Promise.all([
                saveCustomers(filteredCustomers),
                ...serials.map((sn) => deleteSheetRow(sn)),
              ]);
              setCustomers(savedCustomers);
            } catch {
              Alert.alert("Error", "Failed to delete customer.");
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={t.screen}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={t.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={t.content}>
          <View style={s.headerRow}>
            <Text style={t.title}>Add Customer</Text>
            {!showForm && (
              <Pressable style={t.button} onPress={handleAddClick}>
                <Text style={t.buttonText}>+ Add Customer</Text>
              </Pressable>
            )}
          </View>

          {showForm && (
            <View style={t.card}>
              <Text style={s.formTitle}>
                {editingSerials.length > 0 ? "Edit Customer" : "Add New Customer"}
              </Text>

              <View style={s.field}>
                <Text style={t.label}>Customer Name</Text>
                <TextInput
                  style={t.input}
                  placeholder="Enter customer name"
                  placeholderTextColor={colors.muted}
                  value={form.name}
                  onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                />
              </View>

              <View style={s.field}>
                <Text style={t.label}>Mobile Number</Text>
                <TextInput
                  style={t.input}
                  placeholder="Enter mobile number"
                  placeholderTextColor={colors.muted}
                  value={form.mobile}
                  onChangeText={(v) => setForm((f) => ({ ...f, mobile: v }))}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={s.field}>
                <Text style={t.label}>Address</Text>
                <TextInput
                  style={[t.input, { height: 80, textAlignVertical: "top" }]}
                  placeholder="Enter address"
                  placeholderTextColor={colors.muted}
                  value={form.address}
                  onChangeText={(v) => setForm((f) => ({ ...f, address: v }))}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={s.field}>
                <Text style={t.label}>Shift</Text>
                <View style={s.shiftRow}>
                  {SHIFTS.map((option) => {
                    const selected = form.shift === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        style={[s.shiftOption, selected && s.shiftOptionSelected]}
                        onPress={() => setForm((f) => ({ ...f, shift: option.value }))}
                      >
                        <Text style={[s.shiftOptionText, selected && s.shiftOptionTextSelected]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={s.formButtons}>
                <Pressable style={[t.outlineButton, { flex: 1 }]} onPress={handleCancel} disabled={saving}>
                  <Text style={t.outlineText}>Cancel</Text>
                </Pressable>
                <Pressable style={[t.button, { flex: 1 }, saving && { opacity: 0.6 }]} onPress={handleSubmit} disabled={saving}>
                  {saving
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={t.buttonText}>{editingSerials.length > 0 ? "Update" : "Add"} Customer</Text>
                  }
                </Pressable>
              </View>
            </View>
          )}

          <View style={s.tableCard}>
            {customers.length === 0 ? (
              <Text style={s.empty}>No customers added yet. Tap "+ Add Customer" to get started.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  {/* Header row */}
                  <View style={[s.tableRow, s.headerRow2]}>
                    <View style={[s.cell, { width: S_NO_WIDTH }]}>
                      <Text style={s.headerText}>S.No</Text>
                    </View>
                    <View style={[s.cell, { width: NAME_WIDTH }]}>
                      <Text style={s.headerText}>Name</Text>
                    </View>
                    <View style={[s.cell, { width: MOBILE_WIDTH }]}>
                      <Text style={s.headerText}>Mobile</Text>
                    </View>
                    <View style={[s.cell, { width: SHIFT_WIDTH }]}>
                      <Text style={s.headerText}>Shift</Text>
                    </View>
                    <View style={[s.cell, { width: ADDRESS_WIDTH }]}>
                      <Text style={s.headerText}>Address</Text>
                    </View>
                    <View style={[s.cell, { width: ACTIONS_WIDTH, borderRightWidth: 0 }]}>
                      <Text style={s.headerText}>Actions</Text>
                    </View>
                  </View>

                  {/* Data rows */}
                  {groupCustomersByName(customers).map((group, index) => {
                    const primary = group[0];
                    return (
                      <View
                        key={primary.serialNumber}
                        style={[s.tableRow, index % 2 === 0 ? s.rowEven : s.rowOdd]}
                      >
                        <View style={[s.cell, { width: S_NO_WIDTH }]}>
                          <Text style={s.cellText}>{index + 1}</Text>
                        </View>
                        <View style={[s.cell, { width: NAME_WIDTH }]}>
                          <Text style={s.cellTextBold}>{primary.name}</Text>
                        </View>
                        <View style={[s.cell, { width: MOBILE_WIDTH }]}>
                          <Text style={s.cellText}>{primary.mobile || "—"}</Text>
                        </View>
                        <View style={[s.cell, { width: SHIFT_WIDTH }]}>
                          <Text style={s.cellText}>{formatShiftLabel(group)}</Text>
                        </View>
                        <View style={[s.cell, { width: ADDRESS_WIDTH }]}>
                          <Text style={s.cellText} numberOfLines={2}>{primary.address || "—"}</Text>
                        </View>
                        <View style={[s.cell, { width: ACTIONS_WIDTH, borderRightWidth: 0 }]}>
                          <View style={s.actionButtons}>
                            <Pressable
                              style={s.editButton}
                              onPress={() => handleEditClick(group)}
                              disabled={saving}
                            >
                              <Text style={s.editText}>Edit</Text>
                            </Pressable>
                            <Pressable
                              style={s.deleteButton}
                              onPress={() => handleDelete(group)}
                              disabled={saving}
                            >
                              <Text style={s.deleteText}>Delete</Text>
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  formTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "700",
  },
  field: { gap: 6 },
  shiftRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  shiftOption: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  shiftOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  shiftOptionText: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
  },
  shiftOptionTextSelected: {
    color: "#fff",
    fontWeight: "700",
  },
  formButtons: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  tableCard: {
    backgroundColor: "#ffffff",
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  headerRow2: {
    backgroundColor: "#f1f5f9",
  },
  rowEven: {
    backgroundColor: "#ffffff",
  },
  rowOdd: {
    backgroundColor: "#f8fafc",
  },
  cell: {
    borderRightColor: colors.border,
    borderRightWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  headerText: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "left",
  },
  cellText: {
    color: colors.foreground,
    fontSize: 13,
  },
  cellTextBold: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "600",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  editButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#eff6ff",
  },
  editText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "600",
  },
  deleteButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#fff1f2",
  },
  deleteText: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: "600",
  },
  empty: {
    textAlign: "center",
    color: colors.muted,
    padding: 24,
    fontSize: 14,
  },
});
