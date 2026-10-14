"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartColumn,
  ChevronDown,
  CreditCard,
  LayoutGrid,
  X,
} from "lucide-react";
import { useAppSelector } from "@/src/lib/hooks";
import type { Account } from "@/src/features/plaid/plaidSlice";
import Button from "@/src/components/ui/Button";
import { formatCurrency } from "@/src/utils/currency";
import LoadingSkeleton from "@/src/components/LoadingSkeleton";

interface NavChild {
  label: string;
  href: string;
  isActive: (pathname: string) => boolean;
  detail?: string | null;
  balance?: ReactNode;
}

interface NavSection {
  label: string;
  href: string;
  icon: ReactNode;
  isActive: (pathname: string) => boolean;
  children: NavChild[];
  /** Shown under the section row when the child list is unavailable (loading / nothing connected). */
  placeholder?: ReactNode;
}

const DASHBOARD_SECTION: NavSection = {
  label: "Dashboard",
  href: "/",
  icon: <LayoutGrid aria-hidden="true" strokeWidth={1.8} className="h-5 w-5 shrink-0" />,
  isActive: (pathname) => pathname === "/",
  children: [],
};

const BUDGET_SECTION: NavSection = {
  label: "Budget",
  href: "/budget",
  icon: <ChartColumn aria-hidden="true" strokeWidth={1.8} className="h-5 w-5 shrink-0" />,
  isActive: (pathname) => pathname.startsWith("/budget"),
  children: [
    {
      label: "Goals",
      href: "/budget/goals",
      isActive: (pathname) => pathname === "/budget/goals",
    },
    {
      label: "Compare",
      href: "/budget/compare",
      isActive: (pathname) => pathname === "/budget/compare",
    },
  ],
};

function buildAccountsSection(
  accounts: Account[],
  isLinked: boolean,
  accountsLoaded: boolean
): NavSection {
  const children = accounts.map((account) => {
    const href = `/accounts/${account.account_id}`;
    // Credit cards read as money owed, mirroring how their cards display balances.
    const isCredit = account.type === "credit";
    return {
      label: account.name,
      href,
      detail: account.mask ? `···${account.mask}` : account.subtype,
      balance: (
        <span className={isCredit ? "text-red-500" : "text-space-indigo-600"}>
          {formatCurrency(
            isCredit ? -account.balances.current : account.balances.current,
            account.balances.iso_currency_code
          )}
        </span>
      ),
      isActive: (pathname: string) => pathname === href,
    };
  });

  let placeholder: ReactNode;
  if (isLinked && !accountsLoaded) {
    placeholder = <LoadingSkeleton count={2} variant="row" />;
  } else if (!isLinked || accounts.length === 0) {
    placeholder = (
      <Link
        href="/"
        className="block rounded-lg px-2.5 py-1.5 text-xs text-space-indigo-400 transition-colors hover:text-space-indigo-600"
      >
        Connect a bank account &rarr;
      </Link>
    );
  }

  return {
    label: "All Accounts",
    href: "/transactions",
    icon: <CreditCard aria-hidden="true" strokeWidth={1.8} className="h-5 w-5 shrink-0" />,
    isActive: (pathname) =>
      pathname === "/transactions" || pathname.startsWith("/accounts"),
    children,
    placeholder,
  };
}

interface SidebarProps {
  variant: "desktop" | "drawer";
  open?: boolean;
  onClose?: () => void;
  id?: string;
}

export default function Sidebar({
  variant,
  open = false,
  onClose,
  id,
}: SidebarProps) {
  const panelRef = useRef<HTMLElement>(null);

  // Drawer-only behaviours: escape closes, background scroll is locked, focus
  // moves into the panel so keyboard users start inside the dialog.
  useEffect(() => {
    if (variant !== "drawer" || !open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [variant, open, onClose]);

  if (variant === "desktop") {
    return (
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-space-indigo-100 bg-white lg:flex">
        <div className="border-b border-space-indigo-100 px-4 py-3.5">
          <Brand />
        </div>
        <nav
          aria-label="Main navigation"
          className="flex-1 overflow-y-auto px-3 pb-6 pt-3"
        >
          <NavList />
        </nav>
      </aside>
    );
  }

  return (
    <div
      id={id}
      className={`fixed inset-0 z-50 lg:hidden ${open ? "" : "pointer-events-none"}`}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Main navigation"
        // inert keeps the hidden drawer out of tab order and screen readers.
        inert={!open}
        className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-space-indigo-100 px-4 py-3">
          <Brand />
          <Button
            variant="ghost"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="rounded-lg p-1.5 text-space-indigo-500 hover:bg-space-indigo-50 hover:text-space-indigo-700"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </Button>
        </div>
        <nav
          aria-label="Main navigation"
          className="flex-1 overflow-y-auto px-3 pb-6 pt-3"
        >
          <NavList onNavigate={onClose} />
        </nav>
      </aside>
    </div>
  );
}

function Brand() {
  return (
    <Link
      href="/"
      className="inline-block text-lg font-bold tracking-tight text-space-indigo-800 transition-colors hover:text-space-indigo-600"
    >
      Personal Finance
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { isLinked, accounts, accountsLoaded } = useAppSelector(
    (state) => state.plaid
  );
  // One manual expand/collapse override at a time, remembered per pathname:
  // navigation drops it so the active section expands itself automatically.
  const [override, setOverride] = useState<{
    path: string;
    label: string;
    value: boolean;
  } | null>(null);

  const sections = useMemo<NavSection[]>(
    () => [
      DASHBOARD_SECTION,
      BUDGET_SECTION,
      buildAccountsSection(accounts, isLinked, accountsLoaded),
    ],
    [accounts, isLinked, accountsLoaded]
  );

  return (
    <ul className="space-y-1">
      {sections.map((section) => {
        const active = section.isActive(pathname);
        const hasChildren = section.children.length > 0;
        const expanded =
          override &&
          override.path === pathname &&
          override.label === section.label
            ? override.value
            : active;

        return (
          <li key={section.label}>
            <div className="flex items-stretch gap-1">
              <Link
                href={section.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  active
                    ? "bg-space-indigo-50 font-semibold text-space-indigo-800"
                    : "font-medium text-space-indigo-600 hover:bg-space-indigo-50 hover:text-space-indigo-800"
                }`}
              >
                {section.icon}
                <span className="flex-1">{section.label}</span>
              </Link>
              {hasChildren && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    setOverride({
                      path: pathname,
                      label: section.label,
                      value: !expanded,
                    })
                  }
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "Collapse" : "Expand"} ${section.label} submenu`}
                  className="flex w-8 shrink-0 items-center justify-center rounded-lg text-space-indigo-400 hover:bg-space-indigo-50 hover:text-space-indigo-600"
                >
                  <ChevronDown
                    aria-hidden="true"
                    className={`transition-transform duration-200 ${
                      expanded ? "rotate-180" : ""
                    }`}
                  />
                </Button>
              )}
            </div>
            {expanded && hasChildren && (
              <ul className="ml-4 mt-1 space-y-0.5 border-l border-space-indigo-100 py-0.5 pl-3">
                {section.children.map((child) => {
                  const childActive = child.isActive(pathname);
                  return (
                    <li key={child.href}>
                      <Link
                        href={child.href}
                        onClick={onNavigate}
                        aria-current={childActive ? "page" : undefined}
                        className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors sm:text-sm ${
                          childActive
                            ? "bg-space-indigo-50 font-semibold text-space-indigo-800"
                            : "text-space-indigo-500 hover:bg-space-indigo-50/70 hover:text-space-indigo-800"
                        }`}
                      >
                        <span className="flex min-w-0 items-baseline gap-1.5">
                          <span className="truncate">{child.label}</span>
                          {child.detail && (
                            <span className="shrink-0 text-space-indigo-300">
                              {child.detail}
                            </span>
                          )}
                        </span>
                        {child.balance && (
                          <span className="shrink-0 text-xs">
                            {child.balance}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {section.placeholder && !hasChildren && (
              <div className="mt-1 ml-4 pl-3">{section.placeholder}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

