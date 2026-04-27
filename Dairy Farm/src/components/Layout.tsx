import { ReactNode } from "react";
import Sidebar from "./Sidebar";

type LayoutProps = {
  children: ReactNode;
};

function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[260px_1fr]">
      <Sidebar />
      <main className="p-4 md:p-8">{children}</main>
    </div>
  );
}

export default Layout;
