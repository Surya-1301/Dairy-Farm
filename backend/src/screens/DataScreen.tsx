import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getCustomers, getSheet, saveSheet, archiveSheet } from "../storage";
import { colors } from "../theme";
import type { SheetState } from "../types";

const SERIAL_WIDTH = 64;
const NAME_WIDTH = 180;
const SHIFT_WIDTH = 96;
const DAY_WIDTH = 72;
const TOTAL_WIDTH = 72;

function buildDisplaySerialMap(rows: SheetState["rows"]) {
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

export default function DataScreen() {
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSheet();
  }, []);

  const loadSheet = async () => {
    try {
      const [nextSheet, customers] = await Promise.all([getSheet(), getCustomers()]);

      const syncedRows = nextSheet.rows.map((row) => {
        const customer = customers.find((c) => c.serialNumber === row.serialNumber);
        if (customer?.name) {
          return { ...row, customerName: customer.name, shift: customer.shift || row.shift };
        }
        return row;
      });

      const changed = syncedRows.some(
        (r, i) => r.customerName !== nextSheet.rows[i].customerName || r.shift !== nextSheet.rows[i].shift
      );

      const finalSheet = { ...nextSheet, rows: syncedRows };
      setSheet(finalSheet);

      if (changed) {
        await saveSheet(finalSheet);
      }
    } catch {
      Alert.alert("Error", "Failed to load sheet");
    }
  };

  const persist = (nextSheet: SheetState) => {
    setSheet(nextSheet);
    void saveSheet(nextSheet);
  };

  const updateCustomerName = (serialNumber: number, customerName: string) => {
    if (!sheet) return;
    persist({
      ...sheet,
      rows: sheet.rows.map((row) => row.serialNumber === serialNumber ? { ...row, customerName } : row)
    });
  };

  const updateShift = (serialNumber: number, shift: string) => {
    if (!sheet) return;
    persist({
      ...sheet,
      rows: sheet.rows.map((row) => row.serialNumber === serialNumber ? { ...row, shift } : row)
    });
  };

  const updateDayValue = (serialNumber: number, dayIndex: number, value: string) => {
    if (!sheet) return;
    const parsedValue = Number(value);
    const safeValue = Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 0;

    persist({
      ...sheet,
      rows: sheet.rows.map((row) => {
        if (row.serialNumber !== serialNumber) return row;
        const days = [...row.days];
        days[dayIndex] = safeValue;
        return { ...row, days };
      })
    });
  };

  const addRow = () => {
    if (!sheet) return;
    persist({
      ...sheet,
      rows: [
        ...sheet.rows,
        { serialNumber: sheet.rows.length + 1, customerName: "", shift: "", days: Array.from({ length: sheet.dayCount }, () => 0) }
      ]
    });
  };

  const removeRow = () => {
    if (!sheet || sheet.rows.length <= 1) return;
    persist({
      ...sheet,
      rows: sheet.rows.slice(0, -1).map((row, index) => ({ ...row, serialNumber: index + 1 }))
    });
  };

  const addColumn = () => {
    if (!sheet) return;
    persist({
      dayCount: sheet.dayCount + 1,
      rows: sheet.rows.map((row) => ({ ...row, days: [...row.days, 0] }))
    });
  };

  const removeColumn = () => {
    if (!sheet || sheet.dayCount <= 1) return;
    persist({
      dayCount: sheet.dayCount - 1,
      rows: sheet.rows.map((row) => ({ ...row, days: row.days.slice(0, -1) }))
    });
  };

  const saveToHistory = async () => {
    if (!sheet) return;
    setSaving(true);
    try {
      await archiveSheet(sheet);
      await loadSheet();
    } catch {
      Alert.alert("Error", "Failed to save history");
    } finally {
      setSaving(false);
    }
  };

  if (!sheet) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.loading}>Loading...</Text>
      </SafeAreaView>
    );
  }

  const displaySerialNumbers = buildDisplaySerialMap(sheet.rows);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          {/* Controls row — matches web button grid */}
          <View style={styles.controls}>
            <Pressable style={styles.addButton} onPress={addRow}>
              <Text style={styles.addText}>Add Row</Text>
            </Pressable>
            <Pressable
              style={[styles.removeButton, sheet.rows.length <= 1 && styles.disabledButton]}
              onPress={removeRow}
              disabled={sheet.rows.length <= 1}
            >
              <Text style={[styles.removeText, sheet.rows.length <= 1 && styles.disabledText]}>Remove Row</Text>
            </Pressable>
            <Pressable style={styles.addButton} onPress={addColumn}>
              <Text style={styles.addText}>Add Column</Text>
            </Pressable>
            <Pressable
              style={[styles.removeButton, sheet.dayCount <= 1 && styles.disabledButton]}
              onPress={removeColumn}
              disabled={sheet.dayCount <= 1}
            >
              <Text style={[styles.removeText, sheet.dayCount <= 1 && styles.disabledText]}>Remove Column</Text>
            </Pressable>
            <Pressable style={styles.historyButton} onPress={saveToHistory} disabled={saving}>
              <Text style={styles.historyText}>{saving ? "Saving..." : "Save to History"}</Text>
            </Pressable>
          </View>

          {/* Swipe hint */}
          <Text style={styles.hint}>Swipe left/right to view all day columns.</Text>

          {/* Table */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
            <View>
              <View style={[styles.tableRow, styles.headerRow]}>
                <View style={[styles.tableCell, styles.serialCell, styles.headerCell]}>
                  <Text style={styles.headerText}>S No</Text>
                </View>
                <View style={[styles.tableCell, styles.nameCell, styles.headerCell]}>
                  <Text style={styles.headerText}>Customer Name</Text>
                </View>
                <View style={[styles.tableCell, styles.shiftCell, styles.headerCell]}>
                  <Text style={styles.headerText}>Shift</Text>
                </View>
                {Array.from({ length: sheet.dayCount }, (_, index) => (
                  <View key={index} style={[styles.tableCell, styles.dayCell, styles.headerCell]}>
                    <Text style={styles.headerText}>Day {index + 1}</Text>
                  </View>
                ))}
                <View style={[styles.tableCell, styles.totalCell, styles.headerCell]}>
                  <Text style={styles.headerText}>Total</Text>
                </View>
              </View>

              {sheet.rows.map((row, rowIndex) => {
                const total = row.days.reduce((sum, v) => sum + v, 0);
                return (
                  <View
                    key={row.serialNumber}
                    style={[styles.tableRow, rowIndex % 2 === 0 ? styles.rowEven : styles.rowOdd]}
                  >
                    <View style={[styles.tableCell, styles.serialCell]}>
                      <Text style={styles.serialText}>{displaySerialNumbers[rowIndex]}</Text>
                    </View>
                    <View style={[styles.tableCell, styles.nameCell]}>
                      <TextInput
                        value={row.customerName}
                        onChangeText={(v) => updateCustomerName(row.serialNumber, v)}
                        placeholder="Customer Name"
                        placeholderTextColor={colors.muted}
                        style={styles.tableInput}
                      />
                    </View>
                    <View style={[styles.tableCell, styles.shiftCell]}>
                      <TextInput
                        value={row.shift ?? ""}
                        onChangeText={(v) => updateShift(row.serialNumber, v)}
                        placeholder="M/E"
                        placeholderTextColor={colors.muted}
                        style={styles.tableInput}
                      />
                    </View>
                    {row.days.map((value, dayIndex) => (
                      <View key={dayIndex} style={[styles.tableCell, styles.dayCell]}>
                        <TextInput
                          value={value === 0 ? "" : String(value)}
                          onChangeText={(v) => updateDayValue(row.serialNumber, dayIndex, v)}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor={colors.muted}
                          style={[styles.tableInput, styles.dayInput]}
                        />
                      </View>
                    ))}
                    <View style={[styles.tableCell, styles.totalCell]}>
                      <Text style={styles.totalText}>{total}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1
  },
  content: {
    padding: 12,
    gap: 12
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 10
  },
  controls: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  addButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 8,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  addText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600"
  },
  removeButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#fca5a5",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  removeText: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: "600"
  },
  historyButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#6ee7b7",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  historyText: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "600"
  },
  disabledButton: {
    opacity: 0.5
  },
  disabledText: {
    opacity: 0.5
  },
  hint: {
    color: colors.muted,
    fontSize: 12
  },
  tableRow: {
    flexDirection: "row",
    borderBottomColor: colors.border,
    borderBottomWidth: 1
  },
  headerRow: {
    backgroundColor: "#f1f5f9"
  },
  rowEven: {
    backgroundColor: "#ffffff"
  },
  rowOdd: {
    backgroundColor: "#f8fafc"
  },
  tableCell: {
    borderRightColor: colors.border,
    borderRightWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 4,
    paddingVertical: 4
  },
  serialCell: { width: SERIAL_WIDTH },
  nameCell: { width: NAME_WIDTH },
  shiftCell: { width: SHIFT_WIDTH },
  dayCell: { width: DAY_WIDTH },
  totalCell: { width: TOTAL_WIDTH, borderRightWidth: 0 },
  headerCell: {
    paddingVertical: 8
  },
  headerText: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center"
  },
  serialText: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center"
  },
  tableInput: {
    color: colors.foreground,
    fontSize: 13,
    minHeight: 32,
    padding: 0,
    textAlign: "left"
  },
  dayInput: {
    textAlign: "center"
  },
  totalText: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center"
  },
  loading: {
    color: colors.muted,
    fontSize: 16,
    textAlign: "center",
    marginTop: 20
  }
});
