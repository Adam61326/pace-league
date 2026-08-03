// Parsing GPX minimal (regex, pas de DOMParser) : tourne aussi bien côté
// navigateur (RacePlanForm, "use client") que dans un script Node de
// validation — pas de dépendance à l'environnement d'exécution. On ne garde
// que <trkpt lat lon><ele>, le strict nécessaire pour calculer un D+/D- par
// split (voir CLAUDE.md "IMPORT GPX" : pas de visualisation du tracé, pas de
// stockage du fichier brut).
export interface GpxPoint {
  lat: number;
  lon: number;
  eleM: number | null;
}

export interface SplitElevation {
  elevationGainM: number;
  elevationLossM: number;
}

const TRKPT_RE = /<trkpt\b[^>]*\blat="(-?[\d.]+)"[^>]*\blon="(-?[\d.]+)"[^>]*>([\s\S]*?)<\/trkpt>/g;
const ELE_RE = /<ele>\s*(-?[\d.]+)\s*<\/ele>/;
const EARTH_RADIUS_KM = 6371;

export function parseGpxTrackPoints(gpxXml: string): GpxPoint[] {
  const points: GpxPoint[] = [];
  const re = new RegExp(TRKPT_RE);
  let match: RegExpExecArray | null;
  while ((match = re.exec(gpxXml))) {
    const lat = Number(match[1]);
    const lon = Number(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const eleMatch = ELE_RE.exec(match[3]);
    const eleM = eleMatch && Number.isFinite(Number(eleMatch[1])) ? Number(eleMatch[1]) : null;
    points.push({ lat, lon, eleM });
  }
  return points;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineKm(a: GpxPoint, b: GpxPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, h)));
}

// splitLengthsKm doit correspondre, dans l'ordre, à distanceKm de chaque
// split produit par computeRacePlanSplits (même découpage) — la trace GPX
// n'a pas à faire exactement la même distance totale : les points au-delà
// de la dernière borne sont rattachés au dernier split (clamp), un tracé de
// reconnaissance légèrement plus long/court reste exploitable.
export function computeSplitElevations(points: GpxPoint[], splitLengthsKm: number[]): SplitElevation[] {
  const result: SplitElevation[] = splitLengthsKm.map(() => ({ elevationGainM: 0, elevationLossM: 0 }));
  if (points.length < 2 || splitLengthsKm.length === 0) return result;

  const boundaries: number[] = [];
  let acc = 0;
  for (const len of splitLengthsKm) {
    acc += len;
    boundaries.push(acc);
  }

  let cumulativeKm = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    cumulativeKm += haversineKm(prev, curr);

    if (prev.eleM == null || curr.eleM == null) continue;
    const delta = curr.eleM - prev.eleM;
    if (delta === 0) continue;

    const idx = splitIndexForDistance(cumulativeKm, boundaries);
    if (delta > 0) result[idx].elevationGainM += delta;
    else result[idx].elevationLossM += -delta;
  }

  for (const split of result) {
    split.elevationGainM = Math.round(split.elevationGainM);
    split.elevationLossM = Math.round(split.elevationLossM);
  }

  return result;
}

function splitIndexForDistance(distanceKm: number, boundaries: number[]): number {
  for (let i = 0; i < boundaries.length; i++) {
    if (distanceKm <= boundaries[i] + 1e-9) return i;
  }
  return boundaries.length - 1;
}

export interface GpxSummary {
  distanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
}

// Résumé affiché sous le nom du fichier une fois importé (distance et D+/D-
// de la trace elle-même, pas du plan) — indépendant de la distance/du
// découpage configurés, purement informatif sur ce qui a été importé.
export function computeGpxSummary(points: GpxPoint[]): GpxSummary {
  let distanceKm = 0;
  let elevationGainM = 0;
  let elevationLossM = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    distanceKm += haversineKm(prev, curr);

    if (prev.eleM == null || curr.eleM == null) continue;
    const delta = curr.eleM - prev.eleM;
    if (delta > 0) elevationGainM += delta;
    else elevationLossM += -delta;
  }

  return { distanceKm, elevationGainM: Math.round(elevationGainM), elevationLossM: Math.round(elevationLossM) };
}
