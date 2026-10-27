type Ring = number[][];
type Geometry = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };
export interface WardFeature { type?: "Feature"; properties: { ward: string; name: string; areas: string; population: number; name_mr?: string }; geometry: Geometry }

function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPolygon(lon: number, lat: number, rings: Ring[]): boolean {
  return inRing(lon, lat, rings[0]) && !rings.slice(1).some((h) => inRing(lon, lat, h));
}

const polygonsOf = (g: Geometry) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);

/** Distance in metres from a point to the nearest edge of a ring (equirectangular, fine at city scale). */
function ringDistanceM(lon: number, lat: number, ring: Ring): number {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180), ky = 110540;
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = (ring[j][0] - lon) * kx, ay = (ring[j][1] - lat) * ky, bx = (ring[i][0] - lon) * kx, by = (ring[i][1] - lat) * ky;
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/**
 * Ward code containing the point, or null when the point is outside every BMC ward.
 * The shipped outlines are simplified per ward, which leaves slivers of a few metres between neighbours,
 * so a point within `toleranceM` of a ward edge is assigned to the nearest ward.
 */
export function wardAt(features: WardFeature[], lat: number, lon: number, toleranceM = 150): string | null {
  for (const f of features) if (polygonsOf(f.geometry).some((p) => inPolygon(lon, lat, p))) return f.properties.ward;
  let best: { ward: string; d: number } | null = null;
  for (const f of features) {
    for (const p of polygonsOf(f.geometry)) {
      const d = ringDistanceM(lon, lat, p[0]);
      if (d <= toleranceM && (!best || d < best.d)) best = { ward: f.properties.ward, d };
    }
  }
  return best?.ward ?? null;
}

/** Great-circle distance in metres. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000, toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
