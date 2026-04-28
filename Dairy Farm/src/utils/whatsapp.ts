import { getCustomers } from "./customerData";

export function sendWhatsAppMessage(phone: string, message: string) {
  const encodedMessage = encodeURIComponent(message);
  const url = `https://wa.me/${phone}?text=${encodedMessage}`;
  window.open(url, "_blank");
}

export function send15DaysDataToWhatsApp(serialNumber: number) {
  // Get customer info
  const customers = getCustomers();
  const customer = customers.find(c => c.serialNumber === serialNumber);
  
  if (!customer) {
    alert("Customer not found");
    return;
  }

  if (!customer.mobile) {
    alert("Customer mobile number not found");
    return;
  }

  // Get milk data from localStorage
  const SHEET_STORAGE_KEY = "dairy-farm-customer-sheet";
  let sheetData = null;
  
  if (typeof window !== "undefined") {
    const rawData = window.localStorage.getItem(SHEET_STORAGE_KEY);
    if (rawData) {
      try {
        sheetData = JSON.parse(rawData);
      } catch (e) {
        alert("Error reading milk data");
        return;
      }
    }
  }

  if (!sheetData || !sheetData.rows) {
    alert("No milk data found");
    return;
  }

  // Find customer row and get 15 days of data (or available days)
  const customerRow = sheetData.rows.find((row: any) => row.serialNumber === serialNumber);
  
  if (!customerRow) {
    alert("No data found for this customer");
    return;
  }

  // Get up to 15 days of data
  const daysToShow = Math.min(15, customerRow.days.length);
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
