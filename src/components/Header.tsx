"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
  isActive: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/",
    isActive: (pathname) => pathname === "/",
  },
  {
    label: "Budget",
    href: "/budget",
    isActive: (pathname) => pathname.startsWith("/budget"),
  },
  {
    label: "All Accounts",
    href: "/transactions",
    isActive: (pathname) =>
      pathname === "/transactions" || pathname.startsWith("/accounts"),
  },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-space-indigo-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 px-4 py-2.5 sm:gap-4 sm:px-6 sm:py-3">
        <Link
          href="/"
          className="text-base font-bold text-space-indigo-800 transition-colors hover:text-space-indigo-600 sm:text-lg"
        >
          Personal Finance
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-0.5 sm:gap-1">
          {NAV_ITEMS.map(({ label, href, isActive }) => {
            const active = isActive(pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                  active
                    ? "bg-space-indigo-50 text-space-indigo-800"
                    : "text-space-indigo-500 hover:bg-space-indigo-50 hover:text-space-indigo-700"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
