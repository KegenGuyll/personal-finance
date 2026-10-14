"use client";

import type { ComponentProps } from "react";
import { cn } from "@/src/utils/cn";

// `size` is redefined as the visual scale, so the native one-value listbox
// attribute of the same name is dropped.
interface SelectProps extends Omit<ComponentProps<"select">, "size"> {
  size?: "field" | "compact";
}

const SIZE_CLASSES = {
  field: "px-3 py-2 text-sm",
  compact: "px-2 py-1 text-xs",
} as const;

export default function Select({
  size = "field",
  className,
  ...props
}: SelectProps) {
  return (
    <select
      className={cn(
        "w-full rounded-lg border border-space-indigo-200 bg-white text-space-indigo-800 outline-none transition-colors focus:border-space-indigo-400 disabled:opacity-50",
        SIZE_CLASSES[size],
        className
      )}
      {...props}
    />
  );
}
