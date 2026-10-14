"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import Button from "@/src/components/ui/Button";

interface HeaderProps {
  onOpenMenu: () => void;
}

export default function Header({ onOpenMenu }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-space-indigo-100 bg-white/90 backdrop-blur lg:hidden">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <Button
          onClick={onOpenMenu}
          aria-label="Open navigation menu"
          aria-haspopup="dialog"
          aria-controls="app-drawer"
          className="-ml-1.5 rounded-lg p-1.5 text-space-indigo-700 hover:bg-space-indigo-50"
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </Button>
        <Link
          href="/"
          className="text-base font-bold tracking-tight text-space-indigo-800 transition-colors hover:text-space-indigo-600 sm:text-lg"
        >
          Personal Finance
        </Link>
      </div>
    </header>
  );
}
