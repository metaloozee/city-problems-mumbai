export const CAT_COLORS: Record<string, string> = {
  "Potholes": "#e4572e", "Roads & Footpaths": "#f3a712", "Garbage & Sanitation": "#76b041", "Drainage & Sewage": "#3a86ff",
  "Water Supply": "#00b4d8", "Street Lights": "#ffd23f", "Encroachment & Hawkers": "#9b5de5", "Trees & Gardens": "#2d936c",
  "Pests, Health & Environment": "#f15bb5", "Buildings, Licences & Property": "#8d99ae", "Other": "#6c757d",
};
export const RAMP = ["#fff5eb", "#fdd0a2", "#fd8d3c", "#e6550d", "#a63603", "#5c1d00"];
export function rampColor(v: number | null, min: number, max: number): string {
  if (v === null || !isFinite(v)) return "#e5e7eb";
  const t = max === min ? 0.5 : (v - min) / (max - min);
  return RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.floor(t * RAMP.length)))];
}
