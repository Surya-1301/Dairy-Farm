import { ReactNode } from "react";
import BottomNav from "./BottomNav";

type LayoutProps = {
  children: ReactNode;
};

function Layout({ children }: LayoutProps) {
  return (
    <div
      className="min-h-screen"
      style={{
        paddingTop: "var(--safe-area-inset-top)",
        paddingLeft: "var(--safe-area-inset-left)",
        paddingRight: "var(--safe-area-inset-right)"
      }}
    >
      <main
        className="mx-auto w-full max-w-6xl px-4 py-4 md:px-8 md:py-8"
        style={{
          paddingBottom: "calc(6.25rem + var(--safe-area-inset-bottom))"
        }}
      >
        {children}
      </main>
      <BottomNav />
    </div>
  );
}

export default Layout;
