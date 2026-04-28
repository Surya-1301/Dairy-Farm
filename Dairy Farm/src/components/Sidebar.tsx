import { NavLink, useNavigate } from "react-router-dom";
import { logout, getActiveUser, subscribeAuthState } from "../firebase/auth";
import { useState, useEffect } from "react";

const userLinks = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/customers", label: "Add Customer" },
  { to: "/customer-details", label: "Data" },
  { to: "/history", label: "History" },
  { to: "/profile", label: "Profile" }
];

const ownerLinks = [
  { to: "/owner-dashboard", label: "Owner Dashboard" },
  { to: "/profile", label: "Profile" }
];

function Sidebar({ onClose }: { onClose?: () => void }) {
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

  const handleNavClick = () => {
    onClose?.();
  };

  return (
    <aside className="h-screen border-b border-slate-200 bg-white/80 p-4 backdrop-blur md:flex md:min-h-screen md:flex-col md:border-b-0 md:border-r flex flex-col overflow-y-auto">
      <NavLink
        to="/dashboard"
        onClick={handleNavClick}
        className="mb-6 flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 flex-shrink-0"
      >
        <img
          src="/src/assets/logo.png"
          alt="Raipur Dugdh Utapadan Association logo"
          className="h-10 w-10 md:h-12 md:w-12 rounded-full border border-slate-200 object-cover"
        />
        <h1 className="text-lg md:text-xl font-bold text-brand-700 truncate">Dairy Farm</h1>
      </NavLink>
      <nav className="flex gap-2 md:flex-col flex-col md:flex-col flex-grow">
        {(isOwner ? ownerLinks : userLinks).map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            onClick={handleNavClick}
            className={({ isActive }) =>
              `rounded-lg px-4 py-3 text-sm md:text-sm font-medium transition whitespace-nowrap md:whitespace-normal min-h-[48px] flex items-center active:opacity-75 ${
                isActive
                  ? "bg-brand-500 text-white"
                  : "text-slate-700 hover:bg-slate-100 active:bg-slate-200"
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <button
        type="button"
        onClick={onLogout}
        className="mt-auto rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 active:bg-slate-200 w-full min-h-[48px] flex items-center justify-center"
        aria-label="Logout from account"
      >
        Logout
      </button>
    </aside>
  );
}

export default Sidebar;
