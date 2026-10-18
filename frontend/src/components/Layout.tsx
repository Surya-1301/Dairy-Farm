import { ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import BottomNav from "./BottomNav";
import { BACK_TO_CURRENT_SHEET_EVENT } from "./CustomerTable";
import { getCurrentUserProfile, subscribeAuthState } from "../firebase/auth";
import { getTheme, subscribeTheme, toggleTheme } from "../utils/theme";
import { getSheetSearch, setSheetSearch, subscribeSheetSearch } from "../utils/sheetSearch";
import logoRound from "../assets/logo-round.png";

type LayoutProps = {
  children: ReactNode;
};

function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [displayName, setDisplayName] = useState(() => getCurrentUserProfile()?.name || "Farmer");
  const [farmName, setFarmName] = useState(() => getCurrentUserProfile()?.farmName || "");
  const [theme, setThemeState] = useState(getTheme());
  const [sheetSearch, setSheetSearchState] = useState(getSheetSearch());

  useEffect(() => {
    const syncProfile = () => {
      const profile = getCurrentUserProfile();
      if (profile) {
        setDisplayName(profile.name || "Farmer");
        setFarmName(profile.farmName || "");
      }
    };
    syncProfile();
    return subscribeAuthState(syncProfile);
  }, []);

  useEffect(() => {
    return subscribeTheme(() => setThemeState(getTheme()));
  }, []);

  useEffect(() => {
    return subscribeSheetSearch(() => setSheetSearchState(getSheetSearch()));
  }, []);

  const params = new URLSearchParams(location.search);
  const isArchivedSheetOpen =
    location.pathname === "/customer-details" && params.has("edit");
  const isMilkSheetPage = location.pathname === "/customer-details";
  const firstName = (displayName || "Farmer").trim().split(/\s+/)[0] || "Farmer";

  return (
    <div
      className="min-h-screen bg-slate-50 dark:bg-[#161616]"
      style={{
        paddingLeft: "var(--safe-area-inset-left)",
        paddingRight: "var(--safe-area-inset-right)"
      }}
    >
      {/* Mobile-first sticky header — compact on phone, roomy on tablet+ */}
      <header
        className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/90 backdrop-blur dark:border-[#333333] dark:bg-[#161616]/90"
        style={{ paddingTop: "var(--safe-area-inset-top)" }}
      >
        <div className="relative mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-2.5 md:gap-3 md:px-8 md:py-3">
          {isArchivedSheetOpen ? (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(BACK_TO_CURRENT_SHEET_EVENT))}
              aria-label="Back to current sheet"
              title="Back to current sheet"
              className="absolute left-1 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-xl font-bold text-slate-700 active:scale-95 lg:flex dark:border-[#333333] dark:bg-[#212121] dark:text-slate-100"
            >
              ←
            </button>
          ) : null}
          <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-2.5 lg:pl-16">
            {isArchivedSheetOpen ? (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event(BACK_TO_CURRENT_SHEET_EVENT))}
                aria-label="Back to current sheet"
                title="Back to current sheet"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xl font-bold text-slate-700 active:scale-95 md:h-11 md:w-11 lg:hidden dark:border-[#333333] dark:bg-[#212121] dark:text-slate-100"
              >
                ←
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              aria-label="Go to home dashboard"
              className="shrink-0 rounded-full outline-none transition active:scale-95 focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <img
                src={logoRound}
                alt="Raipur Dairy Farm logo"
                className="h-10 w-10 rounded-full object-cover md:h-11 md:w-11"
              />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold leading-tight text-slate-900 dark:text-slate-100 md:text-[15px]">
                Namaste, {firstName} 👋
              </p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400 md:text-xs">
                {farmName || "Raipur Dairy Farm"}
              </p>
            </div>
          </div>
          {isMilkSheetPage ? (
            <div className="hidden md:flex lg:hidden min-w-0 flex-1 md:max-w-[260px] items-center justify-end gap-2">
              <div className="relative min-w-0 flex-1 w-28">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                    <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
                <input
                  type="search"
                  value={sheetSearch}
                  onChange={(event) => setSheetSearch(event.target.value)}
                  placeholder="Search customer name..."
                  aria-label="Search customer name"
                  className="h-11 w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-9 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-[#333333] dark:bg-[#212121] dark:text-white dark:placeholder:text-slate-500"
                />
                {sheetSearch ? (
                  <button
                    type="button"
                    onClick={() => setSheetSearch("")}
                    aria-label="Clear customer search"
                    className="absolute inset-y-0 right-2 flex items-center rounded-full px-2 text-lg leading-none text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-base text-slate-700 active:scale-95 md:h-11 md:w-11 dark:border-[#333333] dark:bg-[#212121] dark:text-slate-100"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      <main
        className="mx-auto w-full max-w-6xl px-4 py-3 md:px-8 md:py-8"
        style={{
          paddingBottom: "calc(7rem + var(--safe-area-inset-bottom))"
        }}
      >
        {children}
      </main>

      <BottomNav />
    </div>
  );
}

export default Layout;