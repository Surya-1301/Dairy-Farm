import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { getHistory, deleteHistoryEntry } from "../storage";
import { colors } from "../theme";
import type { SheetHistoryEntry } from "../types";

function buildDisplaySerialMap(rows: { customerName: string; serialNumber: number }[]) {
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHistoryPdfHtml(entry: SheetHistoryEntry) {
  const displaySerialNumbers = buildDisplaySerialMap(entry.rows);
  const savedDate = new Date(entry.savedAt).toLocaleString();
  const rowsHtml = entry.rows
    .map((row, index) => {
      const total = row.days.reduce((sum, value) => sum + value, 0);
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
    (sum, row) => sum + row.days.reduce((rowSum, value) => rowSum + value, 0),
    0
  );

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          @page { size: A4 landscape; margin: 12px; }
          body {
            font-family: Arial, sans-serif;
            color: #0f172a;
            margin: 0;
            padding: 0;
          }
          .page {
            padding: 12px;
          }
          .header {
            margin-bottom: 12px;
          }
          .eyebrow {
            color: #64748b;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 1px;
            text-transform: uppercase;
          }
          h1 {
            font-size: 20px;
            margin: 4px 0 2px;
          }
          .meta {
            color: #64748b;
            font-size: 11px;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            table-layout: fixed;
          }
          th, td {
            border: 1px solid #cbd5e1;
            font-size: 9px;
            padding: 5px 4px;
            text-align: center;
            vertical-align: middle;
            word-break: break-word;
          }
          th {
            background: #e2e8f0;
            font-weight: 700;
          }
          tbody tr:nth-child(even) td {
            background: #f8fafc;
          }
          .serial { width: 38px; }
          .name { width: 110px; text-align: left; }
          .shift { width: 52px; }
          .day { width: 34px; }
          .total { width: 42px; font-weight: 700; }
          .summary {
            margin-top: 10px;
            font-size: 11px;
            font-weight: 700;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="eyebrow">Dairy Farm Record</div>
            <h1>History Sheet</h1>
            <div class="meta">Saved: ${escapeHtml(savedDate)} | Rows: ${entry.rows.length} | Days: ${entry.dayCount}</div>
          </div>
          <table>
            <thead>
              <tr>${headerHtml}</tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <div class="summary">Grand Total: ${grandTotal.toFixed(1)}</div>
        </div>
      </body>
    </html>
  `;
}

export default function HistoryScreen() {
  const [history, setHistory] = useState<SheetHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<SheetHistoryEntry | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const nextHistory = await getHistory();
      setHistory(nextHistory);
    } catch (error) {
      console.error("Error loading history:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToDevice = async (entry: SheetHistoryEntry) => {
    try {
      const pdf = await Print.printToFileAsync({ html: buildHistoryPdfHtml(entry) });
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
      console.error("Error saving to device:", error);
      Alert.alert("Error", "Failed to generate PDF");
    }
  };

  const handleDeleteHistory = (entry: SheetHistoryEntry) => {
    const savedDate = new Date(entry.savedAt);
    Alert.alert(
      "Delete History",
      `Delete sheet from ${savedDate.toLocaleDateString()} ${savedDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteHistoryEntry(entry.id);
              await loadHistory();
              Alert.alert("Deleted", "History sheet removed");
            } catch (error) {
              Alert.alert("Error", "Failed to delete sheet");
            }
          }
        }
      ]
    );
  };

  const handleViewHistory = (entry: SheetHistoryEntry) => {
    setSelectedEntry(entry);
  };

  const closeHistoryPreview = () => {
    setSelectedEntry(null);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>History</Text>
          <Text style={styles.subtitle}>Saved milk sheets</Text>
        </View>

        {history.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No saved sheets yet</Text>
          </View>
        ) : (
          history.map((entry) => {
            const total = entry.rows.reduce((sum, row) => sum + row.days.reduce((rowSum, value) => rowSum + value, 0), 0);
            const savedDate = new Date(entry.savedAt);

            return (
              <View key={entry.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardDate}>{savedDate.toLocaleDateString()}</Text>
                    <Text style={styles.cardTime}>{savedDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
                  </View>
                </View>
                
                <View style={styles.stats}>
                  <StatItem label="Customers" value={entry.rows.length.toString()} />
                  <StatItem label="Days" value={entry.dayCount.toString()} />
                  <StatItem label="Total Amount" value={total.toFixed(1)} />
                </View>

                <View style={styles.actions}>
                  <Pressable
                    style={[styles.actionButton, styles.viewButton]}
                    onPress={() => handleViewHistory(entry)}
                  >
                    <MaterialCommunityIcons name="eye" color="#ffffff" size={16} />
                    <Text style={styles.actionButtonText}>View</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionButton, styles.saveButton]}
                    onPress={() => handleSaveToDevice(entry)}
                  >
                    <MaterialCommunityIcons name="download" color="#ffffff" size={16} />
                    <Text style={styles.actionButtonText}>Save</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => handleDeleteHistory(entry)}
                  >
                    <MaterialCommunityIcons name="delete" color="#ffffff" size={16} />
                    <Text style={styles.actionButtonText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={selectedEntry !== null} animationType="slide" onRequestClose={closeHistoryPreview}>
        <SafeAreaView style={styles.previewScreen}>
          <View style={styles.previewHeader}>
            <View>
              <Text style={styles.previewTitle}>History Preview</Text>
              <Text style={styles.previewSubtitle}>
                {selectedEntry ? new Date(selectedEntry.savedAt).toLocaleString() : ""}
              </Text>
            </View>

            <Pressable style={styles.closeButton} onPress={closeHistoryPreview}>
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>

          {selectedEntry && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.previewTable}>
                {(() => {
                  const displaySerialNumbers = buildDisplaySerialMap(selectedEntry.rows);

                  return (
                    <>
                      <View style={[styles.previewRow, styles.previewHeaderRow]}>
                        <Text style={[styles.previewCell, styles.serialPreviewCell, styles.previewHeaderText]}>S No</Text>
                        <Text style={[styles.previewCell, styles.namePreviewCell, styles.previewHeaderText]}>Customer</Text>
                        <Text style={[styles.previewCell, styles.shiftPreviewCell, styles.previewHeaderText]}>Shift</Text>
                        {Array.from({ length: selectedEntry.dayCount }, (_, index) => (
                          <Text key={index} style={[styles.previewCell, styles.dayPreviewCell, styles.previewHeaderText]}>
                            Day {index + 1}
                          </Text>
                        ))}
                        <Text style={[styles.previewCell, styles.totalPreviewCell, styles.previewHeaderText]}>Total</Text>
                      </View>

                      {selectedEntry.rows.map((row, index) => {
                        const total = row.days.reduce((sum, value) => sum + value, 0);
                        return (
                          <View key={`${row.serialNumber}-${index}`} style={styles.previewRow}>
                            <Text style={[styles.previewCell, styles.serialPreviewCell]}>{displaySerialNumbers[index]}</Text>
                            <Text style={[styles.previewCell, styles.namePreviewCell]}>{row.customerName}</Text>
                            <Text style={[styles.previewCell, styles.shiftPreviewCell]}>{row.shift ?? ""}</Text>
                            {row.days.map((value, dayIndex) => (
                              <Text key={dayIndex} style={[styles.previewCell, styles.dayPreviewCell]}>
                                {value === 0 ? "" : String(value)}
                              </Text>
                            ))}
                            <Text style={[styles.previewCell, styles.totalPreviewCell]}>{total.toFixed(1)}</Text>
                          </View>
                        );
                      })}
                    </>
                  );
                })()}
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statItem}>
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
    gap: 12
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
  emptyCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 40
  },
  emptyText: {
    color: colors.muted,
    fontSize: 15
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 12
  },
  cardDate: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "700"
  },
  cardTime: {
    color: colors.muted,
    fontSize: 13
  },
  stats: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8
  },
  statItem: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 8,
    flex: 1,
    paddingVertical: 8
  },
  statLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600"
  },
  statValue: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  cardInfo: {
    flex: 1
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12
  },
  actionButton: {
    alignItems: "center",
    borderRadius: 8,
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10
  },
  saveButton: {
    backgroundColor: colors.primary
  },
  deleteButton: {
    backgroundColor: "#ef4444"
  },
  actionButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600"
  },
  viewButton: {
    backgroundColor: colors.muted
  },
  previewScreen: {
    backgroundColor: colors.background,
    flex: 1,
    padding: 16
  },
  previewHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12
  },
  previewTitle: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: "800"
  },
  previewSubtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  closeButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700"
  },
  previewTable: {
    backgroundColor: "#ffffff",
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden"
  },
  previewRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row"
  },
  previewHeaderRow: {
    backgroundColor: "#e2e8f0"
  },
  previewCell: {
    borderRightColor: colors.border,
    borderRightWidth: 1,
    color: colors.foreground,
    minHeight: 40,
    paddingHorizontal: 8,
    paddingVertical: 8,
    textAlign: "center"
  },
  previewHeaderText: {
    fontWeight: "800"
  },
  serialPreviewCell: {
    width: 64
  },
  namePreviewCell: {
    width: 180
  },
  shiftPreviewCell: {
    width: 96
  },
  dayPreviewCell: {
    width: 72
  },
  totalPreviewCell: {
    width: 72
  }
});
