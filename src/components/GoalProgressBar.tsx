export default function GoalProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-space-indigo-100">
      <div
        className="h-full rounded-full bg-ocean-deep-400 transition-all duration-500"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
