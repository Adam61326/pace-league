import type { PerformanceAxis } from "@/lib/performance";

const SIZE = 280;
const CENTER = SIZE / 2;
const RADIUS = 85;
const LABEL_OFFSET = RADIUS + 30;

function polarPoint(angleRad: number, radius: number): [number, number] {
  return [CENTER + radius * Math.sin(angleRad), CENTER - radius * Math.cos(angleRad)];
}

// Radar simple en SVG (pas de dépendance npm). N'affiche que les axes
// disponibles (percentile non-null) — un axe sans donnée suffisante n'est
// jamais tracé comme un 0 (ce serait trompeur), voir la liste de détail
// affichée à côté par l'appelant plutôt que dans ce composant.
export function PerformanceRadar({ axes }: { axes: PerformanceAxis[] }) {
  const available = axes.filter((a) => a.percentile != null);

  if (available.length < 3) {
    return (
      <p className="text-sm text-zinc-400">
        Pas encore assez d&apos;axes disponibles pour tracer le radar — continue à enregistrer des
        activités (et renseigne ta FC dans Paramètres si besoin).
      </p>
    );
  }

  const n = available.length;
  const angleStep = (2 * Math.PI) / n;

  const points = available.map((axis, i) => {
    const angle = i * angleStep;
    const r = (Math.max(0, Math.min(100, axis.percentile!)) / 100) * RADIUS;
    return polarPoint(angle, r);
  });

  const polygonPoints = points.map((p) => p.join(",")).join(" ");
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={SIZE}
      height={SIZE}
      role="img"
      aria-label="Radar de performance"
    >
      {rings.map((r) => (
        <circle
          key={r}
          cx={CENTER}
          cy={CENTER}
          r={RADIUS * r}
          fill="none"
          stroke="var(--color-foreground)"
          strokeOpacity={0.08}
        />
      ))}

      {available.map((axis, i) => {
        const angle = i * angleStep;
        const [x, y] = polarPoint(angle, RADIUS);
        const [lx, ly] = polarPoint(angle, LABEL_OFFSET);
        return (
          <g key={axis.key}>
            <line
              x1={CENTER}
              y1={CENTER}
              x2={x}
              y2={y}
              stroke="var(--color-foreground)"
              strokeOpacity={0.12}
            />
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={11}
              fill="var(--color-foreground)"
              opacity={0.75}
            >
              {axis.label}
            </text>
          </g>
        );
      })}

      <polygon
        points={polygonPoints}
        fill="var(--color-accent)"
        fillOpacity={0.25}
        stroke="var(--color-accent)"
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {points.map(([x, y], i) => (
        <circle key={available[i].key} cx={x} cy={y} r={3.5} fill="var(--color-accent)">
          <title>{`${available[i].label} — ${available[i].percentile}e percentile`}</title>
        </circle>
      ))}
    </svg>
  );
}
