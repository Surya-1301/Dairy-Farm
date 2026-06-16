import emailjs from "@emailjs/browser";

const SERVICE_ID = (import.meta.env.VITE_EMAILJS_SERVICE_ID as string) || "";
const TEMPLATE_ID = (import.meta.env.VITE_EMAILJS_TEMPLATE_ID as string) || "";
const RESET_TEMPLATE_ID = (import.meta.env.VITE_EMAILJS_RESET_TEMPLATE_ID as string) || "";
const PUBLIC_KEY = (import.meta.env.VITE_EMAILJS_PUBLIC_KEY as string) || "";

export const OTP_VALIDITY_MS = 10 * 60 * 1000; // 10 minutes
export const RESET_TOKEN_VALIDITY_MS = 30 * 60 * 1000; // 30 minutes

export function generateResetToken(): string {
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendEmailOtp(toEmail: string, toName: string, otp: string): Promise<void> {
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    throw new Error(
      "Email OTP is not configured. Add VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, and VITE_EMAILJS_PUBLIC_KEY to your .env file."
    );
  }

  const expiryTime = new Date(Date.now() + OTP_VALIDITY_MS).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  await emailjs.send(
    SERVICE_ID,
    TEMPLATE_ID,
    { email: toEmail, to_name: toName || toEmail, passcode: otp, time: expiryTime },
    { publicKey: PUBLIC_KEY }
  );
}

export async function sendPasswordResetLinkEmail(toEmail: string, toName: string, resetUrl: string): Promise<void> {
  if (!SERVICE_ID || !RESET_TEMPLATE_ID || !PUBLIC_KEY) {
    throw new Error(
      "Reset email is not configured. Add VITE_EMAILJS_RESET_TEMPLATE_ID to your .env file."
    );
  }

  await emailjs.send(
    SERVICE_ID,
    RESET_TEMPLATE_ID,
    { email: toEmail, to_name: toName || toEmail, link: resetUrl },
    { publicKey: PUBLIC_KEY }
  );
}
