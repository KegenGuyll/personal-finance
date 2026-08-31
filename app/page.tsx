import type { Metadata } from "next";
import DashboardView from "@/src/components/DashboardView";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "View connected bank accounts, balances, and recent financial status.",
};

export default function HomePage() {
  return <DashboardView />;
}
