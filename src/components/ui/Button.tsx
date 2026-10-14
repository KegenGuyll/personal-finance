"use client";

import type { ComponentProps } from "react";
import { cn } from "@/src/utils/cn";

export type ButtonVariant =
  | "primary"
  | "accent"
  | "secondary"
  | "ghost"
  | "danger"
  | "link"
  | "bare";

export type ButtonSize = "lg" | "md" | "sm" | "xs" | "icon" | "none";

interface ButtonProps extends Omit<ComponentProps<"button">, "variant"> {
  /** Required: a silent default would let solid CTAs drift into text styling. */
  variant: ButtonVariant;
  size?: ButtonSize;
}

// Interaction state is centralized here so every button gets keyboard focus
// visibility and a disabled affordance by construction — before the primitive,
// 72 of 95 buttons had no disabled style and none had a focus-visible style.
const BASE_CLASSES =
  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-space-indigo-400 focus-visible:ring-offset-1 disabled:opacity-50";

// `bare` omits this: its call sites compose their own display and alignment
// (block-level option cards, toggle groups), so the default flex centering
// would fight their layout instead of helping.
const LAYOUT_CLASSES = "inline-flex items-center justify-center gap-1";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-space-indigo-600 text-white hover:bg-space-indigo-700 active:bg-space-indigo-800",
  accent:
    "bg-cornflower-blue-600 text-white hover:bg-cornflower-blue-700 active:bg-cornflower-blue-800",
  secondary:
    "border border-space-indigo-200 bg-white text-space-indigo-600 hover:bg-space-indigo-50",
  ghost:
    "text-space-indigo-400 hover:bg-space-indigo-50 hover:text-space-indigo-600",
  danger: "text-red-500 hover:text-red-600",
  link: "font-medium text-cornflower-blue-600 hover:text-cornflower-blue-700",
  bare: "",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  lg: "rounded-xl px-6 py-3 text-sm font-semibold shadow-2xs",
  md: "rounded-lg px-4 py-2 text-sm font-medium",
  sm: "rounded-lg px-3 py-1.5 text-xs font-medium",
  xs: "rounded-md px-2 py-1 text-xs font-medium",
  icon: "h-8 w-8 rounded-lg p-0",
  none: "",
};

/**
 * The shared button primitive. Defaults to `type="button"` so buttons inside
 * forms no longer submit implicitly; pass `type="submit"` explicitly where a
 * button is a form's submit action.
 */
export default function Button({
  variant,
  size = "md",
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        BASE_CLASSES,
        variant !== "bare" && LAYOUT_CLASSES,
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...props}
    />
  );
}
