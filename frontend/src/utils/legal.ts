// Central constants for DPDP Act 2023 / DPDP Rules 2025 compliance pages.
// Grievance contact defaults to the owner email; override via env where needed.

export const APP_NAME = "Raipur Dairy Farm";
export const FIDUCIARY_NAME = "Raipur Dugdh Utpadan Association";
export const EFFECTIVE_DATE = "18 October 2026";

export const GRIEVANCE_EMAIL =
  ((import.meta.env.VITE_OWNER_EMAIL as string) || "ss058012@gmail.com").trim();

// Grievance Officer details (Rule 9, DPDP Rules 2025 requires publishing these).
// TODO(owner): replace placeholders with the officially designated officer.
export const GRIEVANCE_OFFICER = {
  name: "Grievance Officer, Raipur Dugdh Utpadan Association",
  designation: "Data Protection & Grievance Officer",
  email: GRIEVANCE_EMAIL,
  // Replace with real address / phone before Play Store submission.
  address: "Raipur, Chhattisgarh, India",
  phone: "+91-XXXXXXXXXX",
};

// Timelines stated in the DPDP Rules, 2025 (as notified).
export const GRIEVANCE_ACKNOWLEDGEMENT_DAYS = 3;
export const GRIEVANCE_RESOLUTION_DAYS = 15;
