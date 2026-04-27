const SHEET_STORAGE_KEY = "dairy-farm-customer-sheet";
export const MILK_DATA_CHANGED_EVENT = "dairy-farm-milk-data-changed";

type SheetRow = {
  serialNumber: number;
  customerName: string;
  days: number[];
};

type SheetState = {
  dayCount: number;
  rows: SheetRow[];
};

export type MilkChartPoint = {
  day: string;
  liters: number;
};

function readCurrentSheet(): SheetState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(SHEET_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as SheetState | SheetRow[];

    if (Array.isArray(parsedValue)) {
      return {
        dayCount: parsedValue[0]?.days?.length ?? 0,
        rows: parsedValue
      };
    }

    if (
      parsedValue &&
      typeof parsedValue === "object" &&
      Array.isArray(parsedValue.rows) &&
      typeof parsedValue.dayCount === "number"
    ) {
      return parsedValue;
    }
  } catch {
    return null;
  }

  return null;
}

export function getMilkChartData(): MilkChartPoint[] {
  const sheet = readCurrentSheet();

  if (!sheet || sheet.dayCount <= 0) {
    return [];
  }

  return Array.from({ length: sheet.dayCount }, (_, dayIndex) => ({
    day: `Day ${dayIndex + 1}`,
    liters: sheet.rows.reduce((total, row) => total + (row.days?.[dayIndex] ?? 0), 0)
  }));
}

export function subscribeMilkData(listener: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onChange = () => listener();
  const onStorage = (event: StorageEvent) => {
    if (event.key === SHEET_STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener(MILK_DATA_CHANGED_EVENT, onChange);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(MILK_DATA_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function notifyMilkDataChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(MILK_DATA_CHANGED_EVENT));
}