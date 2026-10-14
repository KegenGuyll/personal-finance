"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/src/utils/cn";

// `size` is redefined as the visual scale, so the native character-width
// attribute of the same name is dropped.
interface TextInputProps extends Omit<ComponentProps<"input">, "size"> {
  size?: "field" | "compact";
  /** Rendered inside the left edge (e.g. the `$` currency prefix). */
  leading?: ReactNode;
  /** Rendered inside the right edge (e.g. the search spinner). */
  trailing?: ReactNode;
}

const SIZE_CLASSES = {
  field: "px-3 py-2 text-sm",
  compact: "px-3 py-1.5 text-xs",
} as const;

export default function TextInput({
  size = "field",
  leading,
  trailing,
  className,
  ...props
}: TextInputProps) {
  const input = (
    <input
      className={cn(
        "w-full rounded-lg border border-space-indigo-200 bg-white text-space-indigo-800 placeholder-space-indigo-300 outline-none transition-colors focus:border-space-indigo-400",
        SIZE_CLASSES[size],
        leading && "pl-10",
        trailing && "pr-10",
        className
      )}
      {...props}
    />
  );

  if (!leading && !trailing) return input;

  // The slot wrappers absolutely position adornments over the input, so the
  // extra horizontal padding above keeps text clear of them.
  return (
    <div className="relative flex items-center">
      {leading && (
        <span className="pointer-events-none absolute left-3 flex items-center">
          {leading}
        </span>
      )}
      {input}
      {trailing && (
        <span className="pointer-events-none absolute right-3 flex items-center">
          {trailing}
        </span>
      )}
    </div>
  );
}