import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { getActiveUser, subscribeAuthState } from "../firebase/auth";

type IconProps = {
  className?: string;
};

function HomeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5a1 1 0 0 1-1-1v-4.5h-3V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function UserPlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 19c0-3 2.4-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18 7v6M15 10h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function DataIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 19V9M12 19V5M19 19v-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function HistoryIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M3.5 6.5V11H8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 11a8 8 0 1 0 3-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8v4l2.5 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SettingsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-.4-1.1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.1-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6c.3 0 .7-.2 1-.6.2-.3.4-.7.4-1.1V3a2 2 0 1 1 4 0v.1c0 .4.2.8.4 1.1.3.4.7.6 1 .6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06c-.4.4-.5 1-.34 1.87.1.4.3.7.6 1 .3.3.7.4 1.1.4H22a2 2 0 1 1 0 4h-.1c-.4 0-.8.2-1.1.4-.3.3-.5.6-.6 1Z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

type NavItem = {
  to: string;
  label: string;
  Icon: (props: IconProps) => JSX.Element;
};

const userLinks = [
  { to: "/dashboard", label: "Dashboard", Icon: HomeIcon },
  { to: "/customers", label: "Customers", Icon: UserPlusIcon },
  { to: "/customer-details", label: "Data", Icon: DataIcon },
  { to: "/history", label: "History", Icon: HistoryIcon },
  { to: "/profile", label: "Settings", Icon: SettingsIcon }
] as const satisfies readonly NavItem[];

const ownerLinks = [
  { to: "/owner-dashboard", label: "Dashboard", Icon: HomeIcon },
  { to: "/profile", label: "Settings", Icon: SettingsIcon }
] as const satisfies readonly NavItem[];

function BottomNav() {
  const [isOwner, setIsOwner] = useState(() => getActiveUser()?.role === "owner");

  useEffect(() => {
    const syncUserRole = () => {
      const user = getActiveUser();
      setIsOwner(user?.role === "owner");
    };

    syncUserRole();
    return subscribeAuthState(syncUserRole);
  }, []);

  const links = isOwner ? ownerLinks : userLinks;

  // Mobile-first: 56px touch targets, safe-area padding, active pill + center FAB for Data entry
  return (
    <nav
      className="bottom-nav fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 shadow-[0_-4px_20px_-8px_rgba(15,23,42,0.15)] backdrop-blur dark:border-[#333333] dark:bg-[#161616]/95"
      style={{
        paddingBottom: "var(--safe-area-inset-bottom)",
        paddingLeft: "var(--safe-area-inset-left)",
        paddingRight: "var(--safe-area-inset-right)"
      }}
    >
      <div className="mx-auto w-full max-w-6xl">
        {isOwner ? (
          <div className="flex items-center justify-center gap-3 px-4 py-2">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `flex min-h-[56px] min-w-[96px] flex-col items-center justify-center rounded-2xl px-4 py-1.5 text-center text-[11px] font-semibold outline-none transition active:scale-95 focus-visible:ring-2 focus-visible:ring-brand-500 ${
                    isActive ? "text-brand-600 dark:text-blue-300" : "text-slate-400 dark:text-slate-500"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <link.Icon className="mb-0.5 h-6 w-6" />
                    <span className={`max-w-full truncate rounded-full px-3 py-0.5 ${isActive ? "bg-brand-50 dark:bg-white/10" : ""}`}>
                      {link.label}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ) : (
          <div className="grid w-full grid-cols-5 items-end px-1 pb-1 pt-1.5">
            {links.map((link) => {
              const isFab = link.to === "/customer-details";
              if (isFab) {
                return (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    aria-label="Milk entry"
                    className={({ isActive }) =>
                      `mx-auto -mt-7 flex h-14 w-14 items-center justify-center rounded-full border-4 border-slate-50 text-white shadow-lg transition active:scale-95 dark:border-[#161616] ${
                        isActive ? "bg-brand-600" : "bg-brand-500"
                      }`
                    }
                  >
                    <link.Icon className="h-6 w-6" />
                  </NavLink>
                );
              }
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `flex min-h-[56px] min-w-0 flex-col items-center justify-center rounded-xl px-1 py-1 text-center text-[10px] font-semibold outline-none transition active:scale-95 focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      isActive ? "text-brand-600 dark:text-blue-300" : "text-slate-400 dark:text-slate-500"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <link.Icon className="mb-0.5 h-6 w-6" />
                      <span className={`max-w-full truncate rounded-full px-2.5 py-0.5 ${isActive ? "bg-brand-50 dark:bg-white/10" : ""}`}>
                        {link.label}
                      </span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}

export default BottomNav;
