export const APP_NAME = "Raipur Dairy Farm";
export const FIDUCIARY_NAME = "Raipur Dugdh Utpadan Association";
export const EFFECTIVE_DATE = "18 October 2026";

// Grievance contact — comes from build env only; the fallback is a
// non-personal org address so no private email is embedded in source.
export const GRIEVANCE_EMAIL = ((import.meta.env.VITE_OWNER_EMAIL as string) || "").trim() || "grievances@dairy-farm.tech";

// Grievance Officer details (Rule 9, DPDP Rules 2025 requires publishing these).
// TODO(owner): replace placeholders with the officially designated officer.
export const GRIEVANCE_OFFICER = {
  name: "Grievance Officer, Raipur Dugdh Utpadan Association",
  designation: "Data Protection & Grievance Officer",
  email: GRIEVANCE_EMAIL,
};

// Timelines stated in the DPDP Rules, 2025 (as notified).
export const GRIEVANCE_ACKNOWLEDGEMENT_DAYS = 3;
export const GRIEVANCE_RESOLUTION_DAYS = 15;
