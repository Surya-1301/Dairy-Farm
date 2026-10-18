import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import logoRound from "../assets/logo-round.png";
import { APP_NAME, EFFECTIVE_DATE } from "../utils/legal";

type LegalShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

function LegalShell({ title, subtitle, children }: LegalShellProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#161616]">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/90 backdrop-blur dark:border-[#333333] dark:bg-[#161616]/90">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xl font-bold text-slate-700 active:scale-95 dark:border-[#333333] dark:bg-[#212121] dark:text-slate-100"
          >
            ←
          </button>
          <img src={logoRound} alt={`${APP_NAME} logo`} className="h-10 w-10 rounded-full object-cover" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-slate-900 dark:text-slate-100">{title}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {subtitle} · Effective {EFFECTIVE_DATE}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-6 md:py-10">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 dark:border-[#333333] dark:bg-[#212121]">
          {children}
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
