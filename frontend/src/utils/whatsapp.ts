import { getCustomers } from "./customerData";
import { getActiveUser } from "../firebase/auth";
import { getSheetByEmail } from "../firebase/data";

export function sendWhatsAppMessage(phone: string, message: string) {
  const encodedMessage = encodeURIComponent(message);
  const url = `https://wa.me/${phone}?text=${encodedMessage}`;
  window.open(url, "_blank");
}

export async function send15DaysDataToWhatsApp(serialNumber: number) {
  // Get customer info
  const customers = await getCustomers();
  const customer = customers.find((c) => c.serialNumber === serialNumber);
  
  if (!customer) {
    alert("Customer not found");
    return;
  }

  if (!customer.mobile) {
    alert("Customer mobile number not found");
    return;
  }

  const activeUser = getActiveUser();
  if (!activeUser?.email) {
    alert("Please sign in first");
    return;
  }

  const sheetData = await getSheetByEmail(activeUser.email);

  if (!sheetData || !sheetData.rows) {
    alert("No milk data found");
    return;
  }

  // Find customer row and get 15 days of data (or available days)
  const customerRow = sheetData.rows.find((row) => row.serialNumber === serialNumber);
  
  if (!customerRow) {
    alert("No data found for this customer");
    return;
  }

  // Get up to 16 days of data
  const daysToShow = Math.min(16, customerRow.days.length);
  const milkData = customerRow.days.slice(0, daysToShow);
  
  // Calculate total
  const total = milkData.reduce((sum: number, val: number) => sum + val, 0);
  const average = daysToShow > 0 ? (total / daysToShow).toFixed(2) : "0";

  // Format message
  let message = `📊 *Milk Data Report*\n`;
  message += `*Name:* ${customer.name}\n`;
  message += `*Period:* Last ${daysToShow} days\n\n`;
  message += `*Daily Data:*\n`;
  
  milkData.forEach((value, index) => {
    message += `Day ${index + 1}: ${value} L\n`;
  });
  
  message += `\n*Summary:*\n`;
  message += `Total: ${total} L\n`;
  message += `Average: ${average} L/day\n`;
  message += `\n_Generated from Dairy Farm Management System_`;

  // Send WhatsApp message
  sendWhatsAppMessage(customer.mobile, message);
}
