import LegalShell from "../components/LegalShell";
import { APP_NAME, EFFECTIVE_DATE, FIDUCIARY_NAME, GRIEVANCE_EMAIL } from "../utils/legal";

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 first:mt-4">
      <h2 className="text-base font-bold text-slate-900 sm:text-lg dark:text-slate-100">{heading}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{children}</div>
    </section>
  );
}

function TermsOfService() {
  return (
    <LegalShell
      title="Terms of Service"
      subtitle={`Effective date: ${EFFECTIVE_DATE} · Operated by ${FIDUCIARY_NAME}. By creating an account or using the app you agree to these terms, which are governed by the laws of India.`}
    >
      <Section heading="1. The service">
        <p>
          {APP_NAME} is a record-keeping tool for dairy businesses: manage customers, record daily
          milk quantities, generate sheets and summaries, and export PDF/Excel reports. The owner
          account additionally sees registered users for administration and support.
        </p>
      </Section>

      <Section heading="2. Eligibility & accounts">
        <ul className="list-disc space-y-1 pl-5">
          <li>You must be at least 18 years old and legally able to enter a contract under Indian law.</li>
          <li>Register with your real name, a valid email and phone number. One account per person.</li>
          <li>You are responsible for keeping your password confidential and for all activity under your account.</li>
          <li>Notify us immediately at {GRIEVANCE_EMAIL} if you suspect unauthorised access.</li>
        </ul>
      </Section>

      <Section heading="3. Acceptable use">
        <ul className="list-disc space-y-1 pl-5">
          <li>Enter only data you are entitled to store (your own customers and business records).</li>
          <li>Do not upload unlawful, defamatory, obscene or infringing content, malware, or other users' personal data without consent.</li>
          <li>Do not misuse the app — no scraping, reverse-engineering, automated abuse, or attempts to access other users' data.</li>
          <li>Do not use the app for any unlawful purpose, including fraud or harassment.</li>
        </ul>
      </Section>

      <Section heading="4. Your data & privacy">
        <p>
          How we collect, use, store and delete your personal data is described in our{" "}
          <strong>Privacy Policy</strong> (DPDP Act, 2023 compliant), which forms part of these
          terms. Using the app confirms your informed consent to that processing. You may withdraw
          consent by deleting your account; core features will stop working once data is erased.
        </p>
      </Section>

      <Section heading="5. Availability & changes">
        <ul className="list-disc space-y-1 pl-5">
          <li>The app is provided on an “as is” and “as available” basis; we aim for high uptime but cannot guarantee uninterrupted service.</li>
          <li>We may add, modify or discontinue features, and update these terms, with notice in the app or on this page. Continued use after changes means acceptance.</li>
        </ul>
      </Section>

      <Section heading="6. Misuse, suspension & termination">
        <p>
          We may warn, suspend or terminate accounts that violate these terms, applicable law
          (including the DPDP Act, 2023), or the rights of others — for example entering someone
          else's personal data without consent, harassment, or attempted unauthorised access. You
          may delete your account at any time from Profile → Delete Account, which permanently
          erases your stored data.
        </p>
      </Section>

      <Section heading="7. Report abuse & grievances">
        <p>
          To report misuse, harassment, a fake listing, a data-accuracy issue or any grievance
          (including under the DPDP Act), use the in-app <strong>Report Abuse / Grievance</strong>{" "}
          page or email{" "}
          <a className="font-semibold text-brand-600 hover:underline dark:text-blue-300" href={`mailto:${GRIEVANCE_EMAIL}`}>
            {GRIEVANCE_EMAIL}
          </a>
          . We acknowledge reports promptly and resolve them within statutory timelines.
        </p>
      </Section>

      <Section heading="8. Limitation of liability">
        <p>
          To the maximum extent permitted by law, {FIDUCIARY_NAME} is not liable for indirect,
          incidental or consequential losses (including loss of business data you failed to back
          up). Our total liability for any claim relating to the app is limited to ₹1,000. Nothing
          here limits rights you have under consumer-protection or data-protection law that cannot
          be waived.
        </p>
      </Section>

      <Section heading="9. Governing law & jurisdiction">
        <p>
          These terms are governed by the laws of India. Courts at Raipur, Chhattisgarh shall have
          exclusive jurisdiction, subject first to good-faith negotiation and any statutory
          grievance remedies under the DPDP Act, 2023.
        </p>
      </Section>

      <Section heading="10. Contact">
        <p>
          Questions about these terms:{" "}
          <a className="font-semibold text-brand-600 hover:underline dark:text-blue-300" href={`mailto:${GRIEVANCE_EMAIL}`}>
            {GRIEVANCE_EMAIL}
          </a>
          .
        </p>
      </Section>
    </LegalShell>
  );
}

export default TermsOfService;
