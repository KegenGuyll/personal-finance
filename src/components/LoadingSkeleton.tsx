import Card from "@/src/components/ui/Card";

export default function LoadingSkeleton({
  count = 5,
  className,
  variant = "card",
}: {
  count?: number;
  className?: string;
  variant?: "card" | "row";
}) {
  if (variant === "row") {
    return (
      <div className={className}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="animate-pulse px-2.5 py-2">
            <div className="h-3.5 w-3/4 rounded bg-space-indigo-100" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <Card
          key={i}
          className="animate-pulse px-4 py-3 shadow-none"
        >
          <div className="mb-2 h-4 w-3/4 rounded bg-space-indigo-100" />
          <div className="h-3 w-1/4 rounded bg-space-indigo-50" />
        </Card>
      ))}
    </div>
  );
}
