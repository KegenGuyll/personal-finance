"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Header from "@/src/components/Header";
import Sidebar from "@/src/components/Sidebar";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Remembered per pathname so any navigation — including back/forward —
  // closes the drawer without an effect that watches the route.
  const [drawer, setDrawer] = useState({ path: "", open: false });
  const drawerOpen = drawer.open && drawer.path === pathname;

  return (
    <>
      <Sidebar variant="desktop" />
      <Header onOpenMenu={() => setDrawer({ path: pathname, open: true })} />
      {/* inert keeps the page behind the open drawer out of tab order. */}
      <div className="flex flex-1 flex-col lg:pl-64" inert={drawerOpen}>
        {children}
      </div>
      <Sidebar
        id="app-drawer"
        variant="drawer"
        open={drawerOpen}
        onClose={() => setDrawer({ path: pathname, open: false })}
      />
    </>
  );
}
