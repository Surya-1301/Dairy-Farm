import { getActiveUser } from "../firebase/auth";
import { getSheetByEmail } from "../firebase/data";

export const MILK_DATA_CHANGED_EVENT = "dairy-farm-milk-data-changed";

type SheetRow = {
  serialNumber: number;
  customerName: string;
  shift: string;
  days: number[];
};

type SheetState = {
  dayCount: number;
  rows: SheetRow[];
};

export type MilkChartPoint = {
  date: string;
  morning: number;
  evening: number;
};

export type MilkDashboardSummary = {
  totalCustomers: number;
  totalAmount: number;
  morningMilk: number;
  eveningMilk: number;
};

function getCurrentPeriodStart(): { year: number; month: number; startDay: number } {
  const now = new Date();

  // Dairy sheets track a fixed half-month period: the 1st–15th, then the
  // 16th through the last day of the month. Once you save the 1–15 sheet and
  // start filling data past the 15th, today's date naturally falls in the
  // second half, so the graph advances to 16–30/31 on its own — and it rolls
  // over to the 1st of the next month once you're past the second half.
  if (now.getDate() <= 15) {
    return { year: now.getFullYear(), month: now.getMonth(), startDay: 1 };
  }

  return { year: now.getFullYear(), month: now.getMonth(), startDay: 16 };
}

function formatDayLabel(dayIndex: number) {
  const { year, month, startDay } = getCurrentPeriodStart();
  const date = new Date(year, month, startDay + dayIndex);

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short"
  });
}

async function readCurrentSheet(): Promise<SheetState | null> {
  const activeUser = getActiveUser();
  if (!activeUser?.email) {
    return null;
  }

  return getSheetByEmail(activeUser.email);
}

export async function getMilkChartData(): Promise<MilkChartPoint[]> {
  const sheet = await readCurrentSheet();

  if (!sheet || sheet.dayCount <= 0) {
    return [];
  }

  return Array.from({ length: sheet.dayCount }, (_, dayIndex) => {
    const morning = sheet.rows
      .filter((row) => row.shift === "M")
      .reduce((total, row) => total + (row.days?.[dayIndex] ?? 0), 0);

    const evening = sheet.rows
      .filter((row) => row.shift === "E")
      .reduce((total, row) => total + (row.days?.[dayIndex] ?? 0), 0);

    return {
      date: formatDayLabel(dayIndex),
      morning: Number(morning.toFixed(2)),
      evening: Number(evening.toFixed(2))
    };
  });
}

export async function getMilkDashboardSummary(): Promise<MilkDashboardSummary> {
  const sheet = await readCurrentSheet();

  if (!sheet) {
    return {
      totalCustomers: 0,
      totalAmount: 0,
      morningMilk: 0,
      eveningMilk: 0
    };
  }

  const activeRows = sheet.rows.filter((row) => row.customerName.trim());
  const totalCustomers = new Set(activeRows.map((row) => row.customerName.trim().toLowerCase())).size;
  const morningMilk = sheet.rows
    .filter((row) => row.shift === "M")
    .reduce((sum, row) => sum + row.days.reduce((rowSum, value) => rowSum + value, 0), 0);
  const eveningMilk = sheet.rows
    .filter((row) => row.shift === "E")
    .reduce((sum, row) => sum + row.days.reduce((rowSum, value) => rowSum + value, 0), 0);
  const totalAmount = sheet.rows.reduce(
    (sum, row) => sum + row.days.reduce((rowSum, value) => rowSum + value, 0),
    0
  );

  return {
    totalCustomers,
    totalAmount: Number(totalAmount.toFixed(2)),
    morningMilk: Number(morningMilk.toFixed(2)),
    eveningMilk: Number(eveningMilk.toFixed(2))
  };
}

export function subscribeMilkData(listener: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onChange = () => listener();
  window.addEventListener(MILK_DATA_CHANGED_EVENT, onChange);

  return () => {
    window.removeEventListener(MILK_DATA_CHANGED_EVENT, onChange);
  };
}

export function notifyMilkDataChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(MILK_DATA_CHANGED_EVENT));
}
