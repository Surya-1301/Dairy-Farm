export interface Customer {
  serialNumber: number;
  name: string;
  mobile: string;
  address: string;
  createdAt: string;
}

const CUSTOMERS_STORAGE_KEY = "dairy-farm-customers";
const CUSTOMERS_CHANGED_EVENT = "CUSTOMERS_CHANGED_EVENT";
const SHEET_STORAGE_KEY = "dairy-farm-customer-sheet";

export function getCustomers(): Customer[] {
  if (typeof window === "undefined") return [];
  
  const stored = window.localStorage.getItem(CUSTOMERS_STORAGE_KEY);
  if (!stored) return [];
  
  try {
    const customers = JSON.parse(stored) as Customer[];
    // Ensure serial numbers are correct
    return customers.map((c, index) => ({
      ...c,
      serialNumber: index + 1
    }));
  } catch {
    return [];
  }
}

export function addCustomer(name: string, mobile: string, address: string): Customer {
  const customers = getCustomers();
  const newCustomer: Customer = {
    serialNumber: customers.length + 1,
    name,
    mobile,
    address,
    createdAt: new Date().toISOString()
  };
  
  customers.push(newCustomer);
  saveCustomers(customers);
  notifyCustomersChanged();
  
  return newCustomer;
}

export function updateCustomer(
  serialNumber: number,
  name: string,
  mobile: string,
  address: string
): Customer | null {
  const customers = getCustomers();
  const index = customers.findIndex(c => c.serialNumber === serialNumber);
  
  if (index === -1) return null;
  
  const updated = {
    ...customers[index],
    name,
    mobile,
    address
  };
  
  customers[index] = updated;
  saveCustomers(customers);
  notifyCustomersChanged();
  
  return updated;
}

export function deleteCustomer(serialNumber: number): boolean {
  const customers = getCustomers();
  const filtered = customers.filter((c) => c.serialNumber !== serialNumber);

  if (filtered.length === customers.length) return false;

  // Recalculate serial numbers
  const renumbered = filtered.map((c, index) => ({
    ...c,
    serialNumber: index + 1
  }));

  saveCustomers(renumbered);
  notifyCustomersChanged();

  // Also remove corresponding row from the milk sheet (if present)
  try {
    if (typeof window !== "undefined") {
      const sheetRaw = window.localStorage.getItem(SHEET_STORAGE_KEY);
      if (sheetRaw) {
        const sheet = JSON.parse(sheetRaw) as { dayCount: number; rows: Array<any> };
        if (sheet && Array.isArray(sheet.rows)) {
          const nextRows = sheet.rows
            .filter((r) => r.serialNumber !== serialNumber)
            .map((r: any, idx: number) => ({ ...r, serialNumber: idx + 1 }));

          const nextSheet = { dayCount: sheet.dayCount, rows: nextRows };
          window.localStorage.setItem(SHEET_STORAGE_KEY, JSON.stringify(nextSheet));
          // notify milk data subscribers if utility is available
          try {
            // dynamic import to avoid potential circular deps
            // but milkData exposes a global event via notifyMilkDataChanged; import directly
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { notifyMilkDataChanged } = require("./milkData");
            if (typeof notifyMilkDataChanged === "function") {
              notifyMilkDataChanged();
            }
          } catch {
            // ignore if notify not available
          }
        }
      }
    }
  } catch {
    // ignore errors while cleaning sheet
  }

  return true;
}

function saveCustomers(customers: Customer[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(customers));
}

export function notifyCustomersChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CUSTOMERS_CHANGED_EVENT));
}

export function subscribeCustomersChanged(listener: () => void): () => void {
  window.addEventListener(CUSTOMERS_CHANGED_EVENT, listener);
  
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === CUSTOMERS_STORAGE_KEY) {
      listener();
    }
  };
  
  window.addEventListener("storage", handleStorageChange);
  
  return () => {
    window.removeEventListener(CUSTOMERS_CHANGED_EVENT, listener);
    window.removeEventListener("storage", handleStorageChange);
  };
}
