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

function Sidebar() {
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

  return (
    <aside className="border-b border-slate-200 bg-white/80 p-4 backdrop-blur md:flex md:min-h-screen md:flex-col md:border-b-0 md:border-r">
      <NavLink
        to="/dashboard"
        className="mb-6 flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <img
          src="/src/assets/logo.png"
          alt="Raipur Dugdh Utapadan Association logo"
          className="h-12 w-12 rounded-full border border-slate-200 object-cover"
        />
        <h1 className="text-xl font-bold text-brand-700">Dairy Farm</h1>
      </NavLink>
      <nav className="flex gap-2 md:flex-col">
        {(isOwner ? ownerLinks : userLinks).map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-brand-500 text-white"
                  : "text-slate-700 hover:bg-slate-100"
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
        className="mt-6 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 md:mt-auto"
      >
        Logout
      </button>
    </aside>
  );
}

export default Sidebar;
