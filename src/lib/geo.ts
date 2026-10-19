const EARTH_RADIUS_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in km between two [lng, lat] points. */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const [lng1, lat1] = a.map(rad);
  const [lng2, lat2] = b.map(rad);
  const h =
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing in degrees (0 = north, clockwise) from a to b, both [lng, lat]. */
export function bearing(a: [number, number], b: [number, number]): number {
  const [lng1, lat1] = a.map(rad);
  const [lng2, lat2] = b.map(rad);
  const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
const ARROWS = ["⬆️", "↗️", "➡️", "↘️", "⬇️", "↙️", "⬅️", "↖️"] as const;

export function compass(bearingDeg: number): { label: string; arrow: string } {
  const i = Math.round(bearingDeg / 45) % 8;
  return { label: COMPASS[i], arrow: ARROWS[i] };
}

export function formatLat(lat: number): string {
  if (Math.abs(lat) < 0.5) return "0°";
  return `${Math.abs(Math.round(lat))}°${lat > 0 ? "N" : "S"}`;
}

export function formatLng(lng: number): string {
  if (Math.abs(lng) < 0.5 || Math.abs(lng) > 179.5) return `${Math.abs(Math.round(lng))}°`;
  return `${Math.abs(Math.round(lng))}°${lng > 0 ? "E" : "W"}`;
}

export function formatKm(km: number): string {
  return km < 10 ? "< 10 km" : `${Math.round(km).toLocaleString("en-US")} km`;
}
