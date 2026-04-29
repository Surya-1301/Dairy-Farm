import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { getActiveUser, logout, subscribeAuthState } from "../firebase/auth";

type IconProps = {
  className?: string;
};

function HomeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5a1 1 0 0 1-1-1v-4.5h-3V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function UserPlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 19c0-3 2.4-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18 7v6M15 10h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function DataIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 19V9M12 19V5M19 19v-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function HistoryIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M3.5 6.5V11H8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 11a8 8 0 1 0 3-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8v4l2.5 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProfileIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="7.5" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 19c0-3 2.7-5 7-5s7 2 7 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LogoutIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M9.5 4.5H7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h2.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M12 12h7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M16.5 8.5 20 12l-3.5 3.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
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
  { to: "/customers", label: "Add Customer", Icon: UserPlusIcon },
  { to: "/customer-details", label: "Data", Icon: DataIcon },
  { to: "/history", label: "History", Icon: HistoryIcon },
  { to: "/profile", label: "Profile", Icon: ProfileIcon }
] as const satisfies readonly NavItem[];

const ownerLinks = [
  { to: "/owner-dashboard", label: "Dashboard", Icon: HomeIcon },
  { to: "/profile", label: "Profile", Icon: ProfileIcon }
] as const satisfies readonly NavItem[];

function BottomNav() {
  const navigate = useNavigate();
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    const syncUserRole = () => {
      const user = getActiveUser();
      setIsOwner(user?.role === "owner");
    };

    syncUserRole();
    return subscribeAuthState(syncUserRole);
  }, []);

  const onLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const links = isOwner ? ownerLinks : userLinks;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur"
      style={{
        paddingBottom: "max(var(--safe-area-inset-bottom), 0.25rem)",
        paddingLeft: "calc(0.5rem + var(--safe-area-inset-left))",
        paddingRight: "calc(0.5rem + var(--safe-area-inset-right))"
      }}
      aria-label="Bottom navigation"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto py-1.5 sm:justify-between">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `group flex min-h-[58px] min-w-[64px] flex-col items-center justify-center rounded-lg px-1 text-[10px] font-medium leading-tight transition sm:flex-1 sm:text-[11px] ${
                isActive ? "text-brand-600" : "text-slate-500 hover:bg-slate-100"
              }`
            }
          >
            <link.Icon className="mb-1 h-6 w-6" />
            {link.label}
          </NavLink>
        ))}

        <button
          type="button"
          onClick={onLogout}
          className="flex min-h-[58px] min-w-[68px] flex-col items-center justify-center border-l border-slate-300 pl-2 pr-2 text-[10px] font-medium leading-tight text-red-700 transition hover:bg-red-50 sm:min-w-[74px] sm:pl-3 sm:text-[11px]"
          aria-label="Logout from account"
        >
          <LogoutIcon className="mb-1 h-6 w-6" />
          Logout
        </button>
      </div>
    </nav>
  );
}

export default BottomNav;
