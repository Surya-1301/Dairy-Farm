import { ReactNode, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import logoRound from "../assets/logo-round.png";
import { getCurrentUserProfile, subscribeAuthState } from "../firebase/auth";
import { getTheme, subscribeTheme, toggleTheme } from "../utils/theme";
import { APP_NAME } from "../utils/legal";

const LEGAL_MENU_LINKS = [
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/terms", label: "Terms of Service" },
  { to: "/report", label: "Report Abuse / Grievance" },
  { to: "/profile", label: "Settings & Profile" },
] as const;

type LegalShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

function LegalShell({ title, subtitle, children }: LegalShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [displayName, setDisplayName] = useState(() => getCurrentUserProfile()?.name || "");
  const [farmName, setFarmName] = useState(() => getCurrentUserProfile()?.farmName || "");
  const [theme, setThemeState] = useState(getTheme());
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const syncProfile = () => {
      const profile = getCurrentUserProfile();
      setDisplayName(profile?.name || "");
      setFarmName(profile?.farmName || "");
    };
    syncProfile();
    return subscribeAuthState(syncProfile);
  }, []);

  useEffect(() => {
    return subscribeTheme(() => setThemeState(getTheme()));
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  const loggedIn = displayName.trim() !== "";
  const firstName = displayName.trim().split(/\s+/)[0] || "";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#161616]">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/90 backdrop-blur dark:border-[#333333] dark:bg-[#161616]/90">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-2 md:py-3">
          <img src={logoRound} alt={`${APP_NAME} logo`} className="h-9 w-9 shrink-0 rounded-full object-cover" />
          {loggedIn ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold leading-tight text-slate-900 dark:text-slate-100 md:text-[15px]">
                Namaste, {firstName} 👋
              </p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400 md:text-xs">
                {farmName || APP_NAME}
              </p>
            </div>
          ) : (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold leading-tight text-slate-900 dark:text-slate-100 md:text-[15px]">
                {APP_NAME}
              </p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400 md:text-xs">
                Legal &amp; Grievance Centre
              </p>
            </div>
          )}
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Open menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-bold tracking-widest text-slate-700 active:scale-95 dark:border-[#333333] dark:bg-[#212121] dark:text-slate-100"
            >
              ⋮
            </button>
            {menuOpen ? (
              <div
                role="menu"
                aria-label="App menu"
                className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-[#333333] dark:bg-[#212121]"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    toggleTheme();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 active:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/5 dark:active:bg-white/10"
                >
                  <span>{theme === "dark" ? "☀️ Switch to light mode" : "🌙 Switch to dark mode"}</span>
                </button>
                <div className="h-px bg-slate-100 dark:bg-[#333333]" />
                {LEGAL_MENU_LINKS.map((link) => (
                  <button
                    key={link.to}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate(link.to);
                    }}
                    className="flex w-full flex-col px-4 py-2.5 text-left transition hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-white/5 dark:active:bg-white/10"
                  >
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{link.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
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
