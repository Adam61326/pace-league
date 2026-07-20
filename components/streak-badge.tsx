export function StreakBadge({
  days,
  size = "sm",
  className = "",
}: {
  days: number;
  size?: "sm" | "lg";
  className?: string;
}) {
  if (days <= 0) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium text-orange-400 ${
        size === "lg" ? "text-base" : "text-xs"
      } ${className}`}
    >
      <span aria-hidden>🔥</span>
      {days} jour{days > 1 ? "s" : ""} de série
    </span>
  );
}
