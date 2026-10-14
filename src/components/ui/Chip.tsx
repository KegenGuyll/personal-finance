import type { ComponentProps } from "react";
import { cn } from "@/src/utils/cn";

interface ChipProps extends ComponentProps<"span"> {
  tone?: "indigo" | "indigo-muted" | "blue" | "emerald" | "amber";
}

const TONE_CLASSES = {
  indigo: "bg-space-indigo-50 text-space-indigo-700",
  "indigo-muted": "bg-space-indigo-100 text-space-indigo-500",
  blue: "bg-cornflower-blue-100 text-cornflower-blue-700",
  emerald: "bg-emerald-100 text-emerald-700",
  // Semantic status color (allowed AGENTS.md exception), same family the
  // budget-health views use for caution states.
  amber: "bg-amber-100 text-amber-700",
} as const;

export default function Chip({ tone = "indigo", className, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
        TONE_CLASSES[tone],
        className
      )}
      {...props}
    />
  );
}
