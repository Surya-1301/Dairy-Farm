// Standalone Node/Express server (NOT a Firebase Cloud Function).
// Deploy on Render's free "Web Service" plan (or any free Node host).
// Only job: use the Firebase Admin SDK to mint a real password-reset
// oobCode. The frontend still sends the actual email through EmailJS,
// exactly as before — this server only supplies a working link.

const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const OWNER_EMAIL = "ss058012@gmail.com";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://dairy-farm-qlw1.onrender.com",
  "https://dairy-farm.tech",
  "https://www.dairy-farm.tech"
];

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
  : DEFAULT_ALLOWED_ORIGINS);

if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT_KEY environment variable.");
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
app.use(express.json());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin) || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["POST", "OPTIONS"]
  })
);

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "dairy-farm-reset-server" });
});

app.post("/generatePasswordResetLink", async (req, res) => {
  const targetEmail = (req.body?.email ?? "").toLowerCase().trim();
  if (!targetEmail) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    let callerEmail;
    try {
      const decoded = await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]);
      callerEmail = decoded.email ? decoded.email.toLowerCase() : undefined;
    } catch {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    if (callerEmail !== OWNER_EMAIL && callerEmail !== targetEmail) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }
  }

  try {
    const link = await admin.auth().generatePasswordResetLink(targetEmail, {
      url: "https://dairy-farm.tech/login"
    });
    const oobCode = new URL(link).searchParams.get("oobCode");

    if (!oobCode) {
      res.status(500).json({ error: "Failed to generate reset code" });
      return;
    }

    res.json({ oobCode });
  } catch (error) {
    if (error && error.code === "auth/user-not-found") {
      res.status(404).json({ error: "No account found for this email" });
      return;
    }
    console.error("generatePasswordResetLink error:", error);
    res.status(500).json({ error: "Failed to generate reset code" });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`Reset server listening on port ${PORT}`);
});
