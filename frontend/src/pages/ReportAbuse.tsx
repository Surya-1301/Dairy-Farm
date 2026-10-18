import { FormEvent, useState } from "react";
import LegalShell from "../components/LegalShell";
import { getActiveUser, getCurrentUserProfile } from "../firebase/auth";
import {
  APP_NAME,
  GRIEVANCE_ACKNOWLEDGEMENT_DAYS,
  GRIEVANCE_EMAIL,
  GRIEVANCE_OFFICER,
  GRIEVANCE_RESOLUTION_DAYS,
} from "../utils/legal";

const CATEGORIES = [
  "Data privacy / DPDP grievance",
  "Account or login issue",
  "Incorrect / someone else's data",
  "Harassment or abusive content",
  "Fraud or misuse",
  "Other",
] as const;

function ReportAbuse() {
  const profile = getCurrentUserProfile();
  const activeUser = getActiveUser();
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [name, setName] = useState(profile?.name || "");
  const [email, setEmail] = useState(profile?.email || activeUser?.email || "");
  const [details, setDetails] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<{ kind: string; text: string } | null>(null);

  // The exact grievance format the user typed — reused for both Gmail + mailto.
  const grievanceSubject = `[${APP_NAME} Grievance] ${category}`;
  const grievanceBody =
    `Name: ${name.trim()}\n` +
    `Email: ${email.trim()}\n` +
    `Category: ${category}\n\n` +
    `Details:\n${details.trim()}\n\n` +
    `(I consent to processing this grievance under the DPDP Act, 2023.)`;

  // Gmail compose with To / Subject / Body prefilled from the form above.
  const gmailLink = () =>
    `https://mail.google.com/mail/?view=cm&fs=1` +
    `&to=${encodeURIComponent(GRIEVANCE_EMAIL)}` +
    `&su=${encodeURIComponent(grievanceSubject)}` +
    `&body=${encodeURIComponent(grievanceBody)}`;

  const mailtoLink = () =>
    `mailto:${GRIEVANCE_EMAIL}?subject=${encodeURIComponent(grievanceSubject)}&body=${encodeURIComponent(grievanceBody)}`;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setStatus(null);
    if (!name.trim() || !email.trim() || !details.trim()) {
      setStatus({ kind: "error", text: "Please fill your name, email and a description." });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setStatus({ kind: "error", text: "Please enter a valid email address." });
      return;
    }
    if (!consent) {
      setStatus({ kind: "error", text: "Please tick the consent checkbox so we can process your grievance." });
      return;
    }
    // Open Gmail (new tab) with the grievance prefilled — user presses Send.
    // Popup blockers can swallow window.open, so fall back to same-tab mailto.
    const opened = window.open(gmailLink(), "_blank", "noopener,noreferrer");
    if (!opened) window.location.href = mailtoLink();
    setStatus({
      kind: "success",
      text: `Opening Gmail with your grievance prefilled — just press Send. We acknowledge within ${GRIEVANCE_ACKNOWLEDGEMENT_DAYS} days and resolve within ${GRIEVANCE_RESOLUTION_DAYS} days.`,
    });
  };


  return (
    <LegalShell
      title="Report Abuse or Raise a Grievance"
      subtitle={`Report misuse or raise a data-privacy grievance under the DPDP Act, 2023. Grievance Officer: ${GRIEVANCE_OFFICER.name} (${GRIEVANCE_OFFICER.email}). We acknowledge within ${GRIEVANCE_ACKNOWLEDGEMENT_DAYS} days and resolve within ${GRIEVANCE_RESOLUTION_DAYS} days.`}
    >
      {status ? (
        <p
          role="status"
          className={`mt-4 rounded-xl border px-4 py-3 text-sm font-medium ${
            status.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
              : status.kind === "error"
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
                : "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200"
          }`}
        >
          {status.text}
        </p>
      ) : null}

      <form onSubmit={(e) => void onSubmit(e)} className="mt-5 space-y-4">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-2 min-h-[48px] w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-[#444] dark:bg-[#161616] dark:text-white"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Your name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              autoComplete="name"
              className="mt-2 min-h-[48px] w-full rounded-lg border border-slate-300 px-4 py-3 text-base dark:border-[#444] dark:bg-[#161616] dark:text-white"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Your email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="mt-2 min-h-[48px] w-full rounded-lg border border-slate-300 px-4 py-3 text-base dark:border-[#444] dark:bg-[#161616] dark:text-white"
            />
          </label>
        </div>

        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Describe the issue
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={5}
            placeholder="What happened, whose data is affected, dates…"
            className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-base leading-relaxed dark:border-[#444] dark:bg-[#161616] dark:text-white"
          />
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500"
          />
          I consent to {APP_NAME} processing these details to resolve my grievance under the DPDP Act, 2023.
        </label>

        {status && (
          <p
            role="status"
            className={`rounded-lg px-4 py-3 text-sm ${
              status.kind === "error"
                ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
                : "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300"
            }`}
          >
            {status.text}
          </p>
        )}

        <button
          type="submit"
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Submit
        </button>
      </form>
    </LegalShell>
  );
}

export default ReportAbuse;
