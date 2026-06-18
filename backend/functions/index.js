const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

initializeApp();

const OWNER_EMAIL = "ss058012@gmail.com";
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://dairy-farm-qlw1.onrender.com",
  "https://raipur-dairy-farmm.web.app",
  "https://raipur-dairy-farmm.firebaseapp.com",
  "https://dairy-farm.tech",
  "https://www.dairy-farm.tech"
];

exports.generatePasswordResetLink = onRequest({ invoker: "public" }, async (req, res) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Max-Age", "3600");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const targetEmail = (req.body?.email ?? "").toLowerCase().trim();
  if (!targetEmail) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    let callerEmail;
    try {
      const decoded = await getAuth().verifyIdToken(authHeader.split("Bearer ")[1]);
      callerEmail = decoded.email?.toLowerCase();
    } catch {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    if (callerEmail !== OWNER_EMAIL && callerEmail !== targetEmail) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }
  }

  const link = await getAuth().generatePasswordResetLink(targetEmail, {
    url: "https://dairy-farm.tech"
  });
  const oobCode = new URL(link).searchParams.get("oobCode");

  if (!oobCode) {
    res.status(500).json({ error: "Failed to generate reset code" });
    return;
  }

  res.json({ oobCode });
});
