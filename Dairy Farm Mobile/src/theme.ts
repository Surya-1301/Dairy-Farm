import { StyleSheet } from "react-native";

export const colors = {
  brand: "#2563eb",
  brandDark: "#1d4ed8",
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  line: "#cbd5e1",
  softLine: "#e2e8f0",
  danger: "#b91c1c",
  dangerSoft: "#fee2e2",
  success: "#047857",
  successSoft: "#d1fae5",
  warningSoft: "#fef3c7",
  warning: "#92400e"
};

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg
  },
  content: {
    padding: 16,
    gap: 16
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800"
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.softLine,
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    gap: 12
  },
  row: {
    flexDirection: "row",
    alignItems: "center"
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.brand,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700"
  },
  outlineButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  outlineText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700"
  },
  dangerButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#fca5a5",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  dangerText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "700"
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  label: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700"
  },
  tableHeader: {
    backgroundColor: "#f1f5f9"
  },
  cell: {
    borderColor: colors.line,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    padding: 8
  },
  cellText: {
    color: colors.text,
    fontSize: 13
  }
});
