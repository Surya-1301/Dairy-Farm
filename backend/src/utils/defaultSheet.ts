import type { SheetState } from "../types";

const DEFAULT_DAY_COUNT = 16;
const DEFAULT_ROW_COUNT = 50;

export function createDefaultSheet(): SheetState {
  return {
    dayCount: DEFAULT_DAY_COUNT,
    rows: Array.from({ length: DEFAULT_ROW_COUNT }, (_, index) => ({
      serialNumber: index + 1,
      customerName: "",
      shift: "",
      days: Array.from({ length: DEFAULT_DAY_COUNT }, () => 0)
    }))
  };
}