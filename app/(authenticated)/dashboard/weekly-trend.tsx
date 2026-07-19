interface TrendWeek {
  weekStart: string; // 'YYYY-MM-DD'
  totalPoints: number;
}

function formatWeekLabel(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: "UTC" });
}

// Comparaison de magnitude sur 4 points : bar chart en teinte unique
// (séquentiel bleu, cf. skill dataviz), labels directs, pas de légende
// nécessaire pour une série unique.
export function WeeklyTrend({ trend }: { trend: TrendWeek[] }) {
  const max = Math.max(1, ...trend.map((w) => w.totalPoints));

  return (
    <div className="flex flex-col gap-2">
      {trend.map((week) => (
        <div key={week.weekStart} className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
            {formatWeekLabel(week.weekStart)}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/[.06] dark:bg-white/[.08]">
            <div
              className="h-full rounded-full bg-[#2a78d6] dark:bg-[#3987e5]"
              style={{ width: `${Math.max(4, (week.totalPoints / max) * 100)}%` }}
            />
          </div>
          <span className="w-14 shrink-0 text-right text-xs font-medium tabular-nums">
            {week.totalPoints.toFixed(1)} pts
          </span>
        </div>
      ))}
    </div>
  );
}
