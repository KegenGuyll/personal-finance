"use client";

import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/src/utils/cn";

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  /** `bottom-sheet` keeps the mobile sheet layout of the budget modal. */
  variant?: "center" | "bottom-sheet";
  size?: "md" | "lg";
  /**
   * id of the element naming the dialog (usually the heading). `role="dialog"`
   * without an accessible name leaves screen-reader users with an unnamed
   * modal, so every call site should pass this.
   */
  labelledBy: string;
  /** Overrides on the panel (e.g. `overflow-y-auto` for tall content). */
  className?: string;
}

const SIZE_CLASSES = {
  md: "max-w-md",
  lg: "max-w-lg",
} as const;

// The palette-token scrim replaces the older bg-black/30 scrims; the
// bottom-sheet keeps its distinct dark blurred scrim by design.
const SCRIM_CLASSES = {
  center:
    "fixed inset-0 z-50 flex items-center justify-center bg-space-indigo-900/40 p-4",
  "bottom-sheet":
    "fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-xs p-0 sm:items-center sm:p-4",
} as const;

const PANEL_CLASSES = {
  center:
    "w-full rounded-lg border border-space-indigo-100 bg-white p-6 shadow-lg",
  "bottom-sheet":
    "w-full rounded-t-2xl border border-space-indigo-100 bg-white p-5 shadow-xl transition-all sm:rounded-2xl",
} as const;

export default function Modal({
  onClose,
  children,
  variant = "center",
  size = "md",
  labelledBy,
  className,
}: ModalProps) {
  const handleScrimClick = () => onClose();

  return (
    <div className={SCRIM_CLASSES[variant]} onClick={handleScrimClick}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          PANEL_CLASSES[variant],
          SIZE_CLASSES[size],
          className
        )}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
