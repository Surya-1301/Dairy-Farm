import { ReactNode, useEffect, useState } from "react";
import BottomNav from "./BottomNav";
import { getCurrentUserProfile, subscribeAuthState } from "../firebase/auth";
import { getTheme, subscribeTheme, toggleTheme } from "../utils/theme";

type LayoutProps = {
  children: ReactNode;
};

function Layout({ children }: LayoutProps) {
  const [displayName, setDisplayName] = useState(() => getCurrentUserProfile()?.name || "Farmer");
  const [farmName, setFarmName] = useState(() => getCurrentUserProfile()?.farmName || "");
  const [theme, setThemeState] = useState(getTheme());

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

  const initial = (displayName.trim().charAt(0) || "R").toUpperCase();

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
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2.5 md:px-8 md:py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white md:h-10 md:w-10">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-bold leading-tight text-slate-900 dark:text-slate-100 md:text-[15px]">
                Namaste, {displayName} 👋
              </p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400 md:text-xs">
                {farmName || "Raipur Dairy Farm"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-base text-slate-700 active:scale-95 dark:border-[#333333] dark:bg-[#212121] dark:text-slate-100"
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