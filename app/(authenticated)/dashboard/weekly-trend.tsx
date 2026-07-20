interface TrendWeek {
  weekStart: string; // 'YYYY-MM-DD'
  totalPoints: number;
}

const WIDTH = 400;
const HEIGHT = 140;
const PADDING_X = 8;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 24;

function formatWeekLabel(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: "UTC" });
}

// Graphique en courbe SVG simple (pas de dépendance npm) : remplace le bar
// chart précédent pour mieux lire la tendance semaine après semaine.
export function WeeklyTrend({ trend }: { trend: TrendWeek[] }) {
  const max = Math.max(1, ...trend.map((w) => w.totalPoints));
  const plotW = WIDTH - PADDING_X * 2;
  const plotH = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  const points = trend.map((week, i) => {
    const x =
      trend.length > 1 ? PADDING_X + (i / (trend.length - 1)) * plotW : PADDING_X + plotW / 2;
    const y = PADDING_TOP + plotH - (week.totalPoints / max) * plotH;
    return { x, y, week };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath =
    points.length > 0
      ? `${linePath} L${points[points.length - 1].x.toFixed(1)},${PADDING_TOP + plotH} L${points[0].x.toFixed(1)},${PADDING_TOP + plotH} Z`
      : "";

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT} role="img" aria-label="Tendance des points hebdomadaires">
      <defs>
        <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {areaPath && <path d={areaPath} fill="url(#trend-fill)" />}
      {linePath && (
        <path d={linePath} fill="none" stroke="var(--color-accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      )}

      {points.map((p) => (
        <g key={p.week.weekStart}>
          <circle cx={p.x} cy={p.y} r={3.5} fill="var(--color-accent)">
            <title>{`${formatWeekLabel(p.week.weekStart)} — ${p.week.totalPoints.toFixed(1)} pts`}</title>
          </circle>
          <text
            x={p.x}
            y={HEIGHT - 6}
            textAnchor="middle"
            fontSize={11}
            fill="var(--color-foreground)"
            opacity={0.5}
          >
            {formatWeekLabel(p.week.weekStart)}
          </text>
        </g>
      ))}
    </svg>
  );
}
