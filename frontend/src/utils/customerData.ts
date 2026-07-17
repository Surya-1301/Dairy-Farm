import { getActiveUser } from "../firebase/auth";
import {
  getCustomersByEmail,
  getSheetByEmail,
  saveCustomersByEmail,
  saveSheetByEmail,
  type Customer
} from "../firebase/data";
import { notifyMilkDataChanged } from "./milkData";

const CUSTOMERS_CHANGED_EVENT = "CUSTOMERS_CHANGED_EVENT";

function getRequiredUserEmail() {
  const activeUser = getActiveUser();
  if (!activeUser?.email) {
    throw new Error("Please sign in to access customers.");
  }

  return activeUser.email;
}

export async function getCustomers(): Promise<Customer[]> {
  return getCustomersByEmail(getRequiredUserEmail());
}

export async function addCustomer(name: string, mobile: string, address: string, shift = ""): Promise<Customer> {
  const customers = await getCustomers();
  const nextCustomer: Customer = {
    serialNumber: customers.length + 1,
    name,
    mobile,
    address,
    shift,
    createdAt: new Date().toISOString()
  };

  const savedCustomers = await saveCustomersByEmail(getRequiredUserEmail(), [...customers, nextCustomer]);
  notifyCustomersChanged();
  return savedCustomers[savedCustomers.length - 1];
}

async function saveReorderedCustomers(customers: Customer[]): Promise<Customer[]> {
  const normalizedCustomers = customers.map((customer, index) => ({
    ...customer,
    serialNumber: index + 1
  }));

  await saveCustomersByEmail(getRequiredUserEmail(), normalizedCustomers);
  notifyCustomersChanged();
  return normalizedCustomers;
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

export async function updateCustomer(
  serialNumber: number,
  name: string,
  mobile: string,
  address: string,
  shift = ""
): Promise<Customer | null> {
  const customers = await getCustomers();
  const index = customers.findIndex((customer) => customer.serialNumber === serialNumber);
  if (index === -1) {
    return null;
  }

  const oldKey = customers[index].name.trim().toLowerCase();

  const nextCustomers = customers.map((customer, i) => {
    if (i === index) {
      return { ...customer, name, mobile, address, shift };
    }
    if (oldKey && customer.name.trim().toLowerCase() === oldKey) {
      return { ...customer, name, mobile, address };
    }
    return customer;
  });

  await saveCustomersByEmail(getRequiredUserEmail(), nextCustomers);
  notifyCustomersChanged();
  return nextCustomers[index];
}

export async function moveCustomer(serialNumber: number, direction: "up" | "down"): Promise<Customer[] | null> {
  const email = getRequiredUserEmail();
  const customers = await getCustomersByEmail(email);
  const index = customers.findIndex((customer) => customer.serialNumber === serialNumber);
  if (index === -1) {
    return null;
  }

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= customers.length) {
    return customers;
  }

  const nextCustomers = moveItem(customers, index, targetIndex);

  const sheet = await getSheetByEmail(email);
  const nextRows = index < sheet.rows.length && targetIndex < sheet.rows.length
    ? moveItem(sheet.rows, index, targetIndex)
    : sheet.rows;

  await Promise.all([
    saveReorderedCustomers(nextCustomers),
    saveSheetByEmail(email, {
      dayCount: sheet.dayCount,
      rows: nextRows.map((row, rowIndex) => ({ ...row, serialNumber: rowIndex + 1 }))
    })
  ]);

  notifyMilkDataChanged();
  return nextCustomers;
}

export async function moveCustomerToPosition(
  serialNumber: number,
  targetSerialNumber: number,
  position: "before" | "after" = "before"
): Promise<Customer[] | null> {
  const email = getRequiredUserEmail();
  const customers = await getCustomersByEmail(email);
  const fromIndex = customers.findIndex((customer) => customer.serialNumber === serialNumber);
  const targetIndex = customers.findIndex((customer) => customer.serialNumber === targetSerialNumber);

  if (fromIndex === -1 || targetIndex === -1 || fromIndex === targetIndex) {
    return customers;
  }

  const destinationIndex = position === "after" ? targetIndex + 1 : targetIndex;
  const nextCustomers = moveItem(customers, fromIndex, destinationIndex > customers.length ? customers.length : destinationIndex);
  const sheet = await getSheetByEmail(email);
  const nextRows = fromIndex < sheet.rows.length && targetIndex < sheet.rows.length
    ? moveItem(sheet.rows, fromIndex, destinationIndex > sheet.rows.length ? sheet.rows.length : destinationIndex)
    : sheet.rows;

  await Promise.all([
    saveReorderedCustomers(nextCustomers),
    saveSheetByEmail(email, {
      dayCount: sheet.dayCount,
      rows: nextRows.map((row, rowIndex) => ({ ...row, serialNumber: rowIndex + 1 }))
    })
  ]);

  notifyMilkDataChanged();
  return nextCustomers;
}

export async function deleteCustomer(serialNumber: number): Promise<boolean> {
  const email = getRequiredUserEmail();
  const customers = await getCustomersByEmail(email);
  const filteredCustomers = customers.filter((customer) => customer.serialNumber !== serialNumber);

  if (filteredCustomers.length === customers.length) {
    return false;
  }

  const sheet = await getSheetByEmail(email);
  const nextRows = sheet.rows
    .filter((row) => row.serialNumber !== serialNumber)
    .map((row, index) => ({ ...row, serialNumber: index + 1 }));

  await Promise.all([
    saveCustomersByEmail(email, filteredCustomers),
    saveSheetByEmail(email, { dayCount: sheet.dayCount, rows: nextRows })
  ]);

  notifyCustomersChanged();
  notifyMilkDataChanged();
  return true;
}

export function notifyCustomersChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CUSTOMERS_CHANGED_EVENT));
}

export function subscribeCustomersChanged(listener: () => void): () => void {
  window.addEventListener(CUSTOMERS_CHANGED_EVENT, listener);

  return () => {
    window.removeEventListener(CUSTOMERS_CHANGED_EVENT, listener);
  };
}
