"use client";

import { useRouter } from "next/navigation";

interface BackButtonProps {
  fallbackHref?: string;
  label?: string;
  className?: string;
}

export default function BackButton({
  fallbackHref = "/",
  label = "Back",
  className = "inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-cornflower-blue-600 underline-offset-2 hover:text-cornflower-blue-700 hover:underline transition-colors",
}: BackButtonProps) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className={className}
      aria-label={label}
    >
      <span aria-hidden="true">&larr;</span>
      <span>{label}</span>
    </button>
  );
}
