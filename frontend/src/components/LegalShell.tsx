import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import logoRound from "../assets/logo-round.png";
import { APP_NAME } from "../utils/legal";

type LegalShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

function LegalShell({ title, subtitle, children }: LegalShellProps) {
  const navigate = useNavigate();

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#161616]">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/90 backdrop-blur dark:border-[#333333] dark:bg-[#161616]/90">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2.5 px-4 py-3">
          <img src={logoRound} alt={`${APP_NAME} logo`} className="h-9 w-9 rounded-full object-cover" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-slate-900 dark:text-slate-100">{APP_NAME}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">Legal &amp; Grievance Centre</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-6 md:py-10">
        <button
          type="button"
          onClick={goBack}
          aria-label="Go back"
          className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition active:scale-95 hover:bg-slate-100 dark:border-[#333333] dark:bg-[#212121] dark:text-slate-100 dark:hover:bg-[#2a2a2a]"
        >
          <span aria-hidden="true">←</span> Back
        </button>
        <article className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 dark:border-[#333333] dark:bg-[#212121]">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{subtitle}</p>
          ) : null}
          <div className="mt-2">{children}</div>
        </article>

        <nav
          aria-label="Legal pages"
          className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-medium"
        >
          <button type="button" onClick={() => navigate("/privacy")} className="text-brand-600 hover:underline dark:text-blue-300">
            Privacy Policy
          </button>
          <button type="button" onClick={() => navigate("/terms")} className="text-brand-600 hover:underline dark:text-blue-300">
            Terms of Service
          </button>
          <button type="button" onClick={() => navigate("/report")} className="text-brand-600 hover:underline dark:text-blue-300">
            Report Abuse / Grievance
          </button>
        </nav>
        <p className="mt-3 text-center text-xs text-slate-400 dark:text-slate-500">
          © {new Date().getFullYear()} {APP_NAME}. Governed by the laws of India.
        </p>
      </main>
    </div>
  );
}

export default LegalShell;
