import { decodePolyline } from "@/lib/polyline";

const PADDING = 6;

// Projection équirectangulaire simple (suffisante à l'échelle d'une seule
// sortie course à pied) : x = longitude * cos(latitude moyenne) pour
// compenser la déformation est-ouest, y = latitude inversée (SVG grandit
// vers le bas, la latitude grandit vers le nord).
function projectPoints(points: [number, number][], width: number, height: number): string {
  if (points.length === 0) return "";

  const avgLat = points.reduce((sum, [lat]) => sum + lat, 0) / points.length;
  const cosLat = Math.cos((avgLat * Math.PI) / 180);

  const projected = points.map(([lat, lng]) => [lng * cosLat, lat] as [number, number]);

  const xs = projected.map((p) => p[0]);
  const ys = projected.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const availableW = width - PADDING * 2;
  const availableH = height - PADDING * 2;
  // Une seule échelle pour les deux axes (pas de déformation du tracé).
  const scale = Math.min(availableW / spanX, availableH / spanY);

  return projected
    .map(([x, y]) => {
      const px = PADDING + (x - minX) * scale + (availableW - spanX * scale) / 2;
      // Inversion de l'axe Y (latitude croissante vers le haut -> SVG vers le bas).
      const py = PADDING + (maxY - y) * scale + (availableH - spanY * scale) / 2;
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(" ");
}

export function RouteMap({
  polyline,
  width = 240,
  height = 140,
  className = "",
}: {
  polyline: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const points = decodePolyline(polyline);
  if (points.length < 2) return null;

  const path = projectPoints(points, width, height);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label="Tracé du parcours"
    >
      <polyline
        points={path}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
