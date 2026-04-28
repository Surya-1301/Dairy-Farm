import { ReactNode, useState } from "react";
import Sidebar from "./Sidebar";

type LayoutProps = {
  children: ReactNode;
};

function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[260px_1fr]" style={{
      paddingTop: 'var(--safe-area-inset-top)',
      paddingLeft: 'var(--safe-area-inset-left)',
      paddingRight: 'var(--safe-area-inset-right)',
    }}>
      {/* Mobile menu button - Android optimized touch target */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed top-3 left-3 z-50 p-3 rounded-lg bg-brand-500 text-white active:bg-brand-600 transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center"
        style={{
          top: 'calc(0.75rem + var(--safe-area-inset-top))',
          left: 'calc(0.75rem + var(--safe-area-inset-left))',
        }}
        aria-label={sidebarOpen ? "Close menu" : "Open menu"}
      >
        {sidebarOpen ? "✕" : "☰"}
      </button>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed md:static md:z-auto inset-0 z-40 w-64 md:w-auto md:col-span-1 transform transition-transform md:transform-none ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <main className="p-4 pt-16 md:pt-4 md:p-8 pb-8" style={{
        paddingBottom: 'calc(2rem + var(--safe-area-inset-bottom))',
        paddingRight: 'calc(1rem + var(--safe-area-inset-right))',
      }}>{children}</main>
    </div>
  );
}

export default Layout;
