import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges caller classNames into a primitive's defaults. tailwind-merge makes
 * overrides safe: a caller-supplied `px-2` replaces the primitive's `px-3`
 * instead of leaving two conflicting `px-*` classes whose winner depends on
 * CSS order (see issue #18).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
