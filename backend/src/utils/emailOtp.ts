const SERVICE_ID = process.env.EXPO_PUBLIC_EMAILJS_SERVICE_ID ?? "";
const TEMPLATE_ID = process.env.EXPO_PUBLIC_EMAILJS_TEMPLATE_ID ?? "";
const RESET_TEMPLATE_ID = process.env.EXPO_PUBLIC_EMAILJS_RESET_TEMPLATE_ID ?? "";
const PUBLIC_KEY = process.env.EXPO_PUBLIC_EMAILJS_PUBLIC_KEY ?? "";

export const OTP_VALIDITY_MS = 10 * 60 * 1000;

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendEmailOtp(toEmail: string, toName: string, otp: string): Promise<void> {
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    throw new Error("Email OTP is not configured. Add EXPO_PUBLIC_EMAILJS_* to your .env file.");
  }

  const expiryTime = new Date(Date.now() + OTP_VALIDITY_MS).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: SERVICE_ID,
      template_id: TEMPLATE_ID,
      user_id: PUBLIC_KEY,
      template_params: {
        email: toEmail,
        to_name: toName || toEmail,
        passcode: otp,
        time: expiryTime,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to send verification email: ${text}`);
  }
}

export async function sendPasswordResetLinkEmail(toEmail: string, toName: string, resetUrl: string): Promise<void> {
  if (!SERVICE_ID || !RESET_TEMPLATE_ID || !PUBLIC_KEY) {
    throw new Error("Password reset email is not configured. Add EXPO_PUBLIC_EMAILJS_RESET_TEMPLATE_ID to your .env file.");
  }

  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: SERVICE_ID,
      template_id: RESET_TEMPLATE_ID,
      user_id: PUBLIC_KEY,
      template_params: {
        email: toEmail,
        to_name: toName || toEmail,
        link: resetUrl,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to send reset email: ${text}`);
  }
}
