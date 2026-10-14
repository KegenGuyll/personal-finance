import type { ComponentProps } from "react";
import { cn } from "@/src/utils/cn";

interface NoticeProps extends ComponentProps<"p"> {
  tone?: "info" | "blue" | "warning";
  /** `div` for panels that contain block children, `p` for plain messages. */
  as?: "p" | "div";
}

// Semantic-status colors (amber for caution) are an allowed exception in
// AGENTS.md's palette rule; the informational tone uses the soft-periwinkle
// token family.
const TONE_CLASSES = {
  info: "border-soft-periwinkle-200 bg-soft-periwinkle-50 text-soft-periwinkle-800",
  blue: "border-cornflower-blue-200 bg-cornflower-blue-50 text-cornflower-blue-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
} as const;

export default function Notice({
  tone = "info",
  as = "p",
  className,
  ...props
}: NoticeProps) {
  const Tag = as;
  return (
    <Tag
      className={cn(
        "rounded-md border px-3 py-2 text-xs",
        TONE_CLASSES[tone],
        className
      )}
      {...props}
    />
  );
}
