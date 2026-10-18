import LegalShell from "../components/LegalShell";
import {
  APP_NAME,
  EFFECTIVE_DATE,
  FIDUCIARY_NAME,
  GRIEVANCE_EMAIL,
  GRIEVANCE_OFFICER,
  GRIEVANCE_RESOLUTION_DAYS,
} from "../utils/legal";

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 first:mt-4">
      <h2 className="text-base font-bold text-slate-900 sm:text-lg dark:text-slate-100">{heading}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{children}</div>
    </section>
  );
}

function PrivacyPolicy() {
  return (
    <LegalShell
      title="Privacy Policy"
      subtitle={`Effective date: ${EFFECTIVE_DATE} · Data Fiduciary: ${FIDUCIARY_NAME}. Framed under the Digital Personal Data Protection Act, 2023 and the DPDP Rules, 2025. Contact: ${GRIEVANCE_EMAIL}.`}
    >
      <Section heading="1. Who we are (Data Fiduciary)">
        <p>
          {FIDUCIARY_NAME} (“we”, “us”, “our”) operates {APP_NAME}, which helps dairy farmers
          record customers, daily milk quantities and payment sheets.
        </p>
      </Section>

      <Section heading="2. Data we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Account data:</strong> name, email, phone, farm name, profile photo (optional).</li>
          <li><strong>Business data you enter:</strong> customer names, phone numbers, milk quantities, rates, sheets and history.</li>
          <li><strong>Technical data:</strong> sign-in identifiers, auth tokens and diagnostics for security.</li>
        </ul>
        <p>No biometric data, precise location, or data beyond what the app needs.</p>
      </Section>

      <Section heading="3. Purpose & consent (Sec. 5 & 6, DPDP Act)">
        <ul className="list-disc space-y-1 pl-5">
          <li>Creating and securing your account (email/password or Google sign-in).</li>
          <li>Storing and syncing the customer and milk records you enter.</li>
          <li>Sending OTPs, reset links and service emails via EmailJS.</li>
          <li>Preventing misuse, enforcing Terms, and complying with law.</li>
        </ul>
        <p>
          Sign-up is your free, specific, informed consent for these purposes, with a link to this
          notice describing the data and purpose (Rule 3, DPDP Rules 2025).
        </p>
      </Section>

      <Section heading="4. Storage & safeguards (Sec. 8, DPDP Act)">
        <ul className="list-disc space-y-1 pl-5">
          <li>Data stored in Google Firebase, guarded by security rules — users access only their own records.</li>
          <li>Profile photos on Cloudinary over encrypted (HTTPS) connections.</li>
          <li>Passwords handled by Firebase Authentication, never visible to us in plain text.</li>
        </ul>
      </Section>

      <Section heading="5. Sharing">
        <p>We never sell your data. Processors acting on our instructions only:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Google Firebase (hosting, database, authentication).</li>
          <li>Cloudinary (photo storage) and EmailJS (transactional emails you request).</li>
        </ul>
        <p>Disclosures to authorities only when required by Indian law.</p>
      </Section>

      <Section heading="6. Retention (Sec. 8(7))">
        <p>
          Kept while your account is active and for a reasonable period after for legal needs.
          Profile → Delete Account permanently erases your profile, customers, sheets and history.
        </p>
      </Section>

      <Section heading="7. Your rights (Sec. 11–14)">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Access & correction:</strong> view/edit your profile under Settings / Profile.</li>
          <li><strong>Withdraw consent:</strong> stop using the app and delete your account.</li>
          <li><strong>Erasure:</strong> in-app delete, or email us — erased within {GRIEVANCE_RESOLUTION_DAYS} days of verification.</li>
          <li><strong>Nomination:</strong> nominate someone to act for you — write to {GRIEVANCE_EMAIL}.</li>
          <li><strong>Grievance:</strong> contact our Grievance Officer below; appeal to the Data Protection Board of India if unresolved.</li>
        </ul>
      </Section>

      <Section heading="8. Children's data (Sec. 9)">
        <p>
          For adults running a dairy business. We do not knowingly collect data of children under
          18 — contact us and we will delete any such data promptly.
        </p>
      </Section>

      <Section heading="9. Grievance Officer (Rule 9, DPDP Rules 2025)">
        <ul className="list-none space-y-1 rounded-xl bg-slate-50 p-4 dark:bg-white/5">
          <li><strong>{GRIEVANCE_OFFICER.name}</strong> — {GRIEVANCE_OFFICER.designation}</li>
          <li>
            Email:{" "}
            <a className="font-semibold text-brand-600 hover:underline dark:text-blue-300" href={`mailto:${GRIEVANCE_OFFICER.email}`}>
              {GRIEVANCE_OFFICER.email}
            </a>
          </li>
        </ul>
        <p>Or raise it from the in-app Report Abuse / Grievance page.</p>
      </Section>

      <Section heading="10. Changes">
        <p>
          Updates appear on this page with a new effective date; we seek fresh consent where the
          DPDP Act requires it.
        </p>
      </Section>
    </LegalShell>
  );
}

export default PrivacyPolicy;
