import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { getSheet } from "../storage";
import { colors } from "../theme";
import type { SheetState } from "../types";

export default function DashboardScreen() {
  const navigation = useNavigation();
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const nextSheet = await getSheet();
      setSheet(nextSheet);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!sheet) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.loading}>Loading...</Text>
      </SafeAreaView>
    );
  }

  const activeRows = sheet.rows.filter((row) => row.customerName.trim());
  const uniqueCustomerCount = new Set(activeRows.map((row) => row.customerName.trim().toLowerCase())).size;

  const morningTotal = sheet.rows
    .filter((row) => row.shift === "M")
    .reduce((sum, row) => sum + row.days.reduce((rowSum, value) => rowSum + value, 0), 0);

  const eveningTotal = sheet.rows
    .filter((row) => row.shift === "E")
    .reduce((sum, row) => sum + row.days.reduce((rowSum, value) => rowSum + value, 0), 0);

  const totalLiters = sheet.rows
    .reduce((sum, row) => sum + row.days.reduce((rowSum, value) => rowSum + value, 0), 0);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Summary</Text>
          <View style={styles.metricsContainer}>
            <Pressable
              style={({ pressed }) => [styles.metricCard, pressed && styles.metricCardPressed]}
              onPress={() => navigation.navigate("Customers" as never)}
            >
              <Text style={styles.metricLabel}>Customers</Text>
              <Text style={styles.metricValue}>{uniqueCustomerCount}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.metricCard, pressed && styles.metricCardPressed]}
              onPress={() => navigation.navigate("Data" as never)}
            >
              <Text style={styles.metricLabel}>Total Milk</Text>
              <Text style={styles.metricValue}>{Number(totalLiters.toFixed(2))} L</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.metricCard, pressed && styles.metricCardPressed]}
              onPress={() => navigation.navigate("Data" as never)}
            >
              <Text style={styles.metricLabel}>Morning</Text>
              <Text style={styles.metricValue}>{Number(morningTotal.toFixed(2))} L</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.metricCard, pressed && styles.metricCardPressed]}
              onPress={() => navigation.navigate("Data" as never)}
            >
              <Text style={styles.metricLabel}>Evening</Text>
              <Text style={styles.metricValue}>{Number(eveningTotal.toFixed(2))} L</Text>
            </Pressable>
          </View>
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
    padding: 16,
    gap: 16
  },
  summaryCard: {
    backgroundColor: "#ffffff",
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 12
  },
  summaryTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "700"
  },
  metricsContainer: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap"
  },
  metricCard: {
    backgroundColor: "#f8fafc",
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    minWidth: 100,
    padding: 12
  },
  metricCardPressed: {
    backgroundColor: "#f1f5f9"
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  metricValue: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: "700",
    marginTop: 4
  },
  loading: {
    color: colors.muted,
    fontSize: 16,
    textAlign: "center",
    marginTop: 20
  }
});
