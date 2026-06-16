const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

initializeApp();

const OWNER_EMAIL = "ss058012@gmail.com";

exports.generatePasswordResetLink = onCall({ cors: true }, async (request) => {
  const callerEmail = request.auth?.token?.email?.toLowerCase();
  const targetEmail = (request.data?.email ?? "").toLowerCase().trim();

  if (!callerEmail) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }
  if (!targetEmail) {
    throw new HttpsError("invalid-argument", "Email is required.");
  }
  if (callerEmail !== OWNER_EMAIL && callerEmail !== targetEmail) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const appUrl = "https://dairy-farm-qlw1.onrender.com";
  const link = await getAuth().generatePasswordResetLink(targetEmail, {
    url: appUrl
  });

  const oobCode = new URL(link).searchParams.get("oobCode");
  if (!oobCode) {
    throw new HttpsError("internal", "Failed to generate reset code.");
  }

  return { oobCode };
});
