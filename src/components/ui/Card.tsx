import type { ComponentProps } from "react";
import { cn } from "@/src/utils/cn";

interface CardProps extends ComponentProps<"div"> {
  padding?: "sm" | "md" | "lg";
}

const PADDING_CLASSES = {
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
} as const;

export default function Card({
  padding = "md",
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-space-indigo-100 bg-white shadow-sm",
        PADDING_CLASSES[padding],
        className
      )}
      {...props}
    />
  );
}
