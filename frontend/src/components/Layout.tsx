import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "./BottomNav";
import { getCurrentUserProfile, subscribeAuthState } from "../firebase/auth";
import { getTheme, subscribeTheme, toggleTheme } from "../utils/theme";
import logoRound from "../assets/logo-round.png";

type LayoutProps = {
  children: ReactNode;
};

function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
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