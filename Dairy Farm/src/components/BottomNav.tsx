import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { getActiveUser, logout, subscribeAuthState } from "../firebase/auth";

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

function LogoutIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
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
  { to: "/customers", label: "Add", Icon: UserPlusIcon },
  { to: "/customer-details", label: "Data", Icon: DataIcon },
  { to: "/history", label: "History", Icon: HistoryIcon },
  { to: "/profile", label: "Settings", Icon: SettingsIcon }
] as const satisfies readonly NavItem[];

const ownerLinks = [
  { to: "/owner-dashboard", label: "Dashboard", Icon: HomeIcon },
  { to: "/profile", label: "Settings", Icon: SettingsIcon }
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
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white shadow-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-2 py-2">

        {/* NAV ITEMS */}
        <div className="flex flex-1 justify-around">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center text-xs font-medium transition ${
                  isActive
                    ? "text-blue-600"
                    : "text-gray-500 hover:text-blue-500"
                }`
              }
            >
              <link.Icon className="h-6 w-6 mb-1" />
              {link.label}
            </NavLink>
          ))}
        </div>

        {/* LOGOUT */}
        <button
          onClick={onLogout}
          className="ml-2 flex flex-col items-center justify-center text-xs font-medium text-red-600 hover:text-red-700"
        >
          <LogoutIcon className="h-6 w-6 mb-1" />
          Logout
        </button>

      </div>
    </nav>
  );
}

export default BottomNav;