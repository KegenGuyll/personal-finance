import type { LabelHTMLAttributes } from "react";
import { cn } from "@/src/utils/cn";

interface FieldLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  htmlFor?: string;
}

export default function FieldLabel({
  className,
  ...props
}: FieldLabelProps) {
  return (
    <label
      className={cn("block text-xs font-medium text-space-indigo-600", className)}
      {...props}
    />
  );
}
