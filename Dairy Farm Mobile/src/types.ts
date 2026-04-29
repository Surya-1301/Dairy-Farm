export type Role = "owner" | "user";

export type ActiveUser = {
  email: string;
  role: Role;
  phone: string;
};

export type UserProfile = {
  phone: string;
  email: string;
  role: Role;
  name: string;
  farmName: string;
  avatarUrl?: string;
  updatedAt: string;
};

export type Customer = {
  serialNumber: number;
  name: string;
  mobile: string;
  address: string;
  createdAt: string;
};

export type SheetRow = {
  serialNumber: number;
  customerName: string;
  days: number[];
};

export type SheetState = {
  dayCount: number;
  rows: SheetRow[];
};

export type SheetHistoryEntry = SheetState & {
  id: string;
  savedAt: string;
};

export type TabKey = "dashboard" | "customers" | "data" | "history" | "profile" | "owner";
