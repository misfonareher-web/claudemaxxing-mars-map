/** Mars 2000 sphere radius in kilometres (matches data/README.md). */
export const MARS_RADIUS_KM = 3396.19;
export const KM_PER_DEG_LAT = (Math.PI * MARS_RADIUS_KM) / 180;
export const KM_TO_MI = 0.621371;

export type DistanceUnit = "km" | "mi";

export function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

export function greatCircleKm(
  a: { lon: number; lat: number },
  b: { lon: number; lat: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * MARS_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Sample waypoints along the shortest longitudinal path across Mars (±180° safe).
 */
export function sampleRouteCoordinates(
  from: [number, number],
  to: [number, number],
  steps = 24
): [number, number][] {
  const [lon1, lat1] = from;
  const [lon2, lat2] = to;
  const deltaLon = ((((lon2 - lon1 + 540) % 360) + 360) % 360) - 180;
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lon = normalizeLon(lon1 + deltaLon * t);
    const lat = lat1 + (lat2 - lat1) * t;
    coords.push([Math.round(lon * 1000) / 1000, Math.round(lat * 1000) / 1000]);
  }
  return coords;
}

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi === yj) continue;
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Point-in-polygon check supporting Polygon and MultiPolygon GeoJSON geometries with holes.
 */
export function pointInGeometry(
  lon: number,
  lat: number,
  geometry: { type: string; coordinates: unknown }
): boolean {
  const polygons: number[][][][] =
    geometry.type === "Polygon"
      ? [geometry.coordinates as number[][][]]
      : geometry.type === "MultiPolygon"
        ? (geometry.coordinates as number[][][][])
        : [];

  for (const poly of polygons) {
    if (!poly.length) continue;
    let inPoly = pointInRing(lon, lat, poly[0]);
    for (let h = 1; h < poly.length; h++) {
      if (pointInRing(lon, lat, poly[h])) {
        inPoly = false;
      }
    }
    if (inPoly) return true;
  }
  return false;
}

export function formatDistance(km: number, unit: DistanceUnit = "km"): string {
  const val = unit === "km" ? km : km * KM_TO_MI;
  const decimals = val >= 100 ? 0 : 1;
  return `${val.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} ${unit}`;
}

export function formatDuration(hours: number): string {
  if (hours <= 0) return "0 min";
  const totalMin = Math.max(1, Math.round(hours * 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${m.toString().padStart(2, "0")} min`;
}

