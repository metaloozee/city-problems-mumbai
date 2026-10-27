import type { CitizenReport } from "./types";

const LOCAL_KEY = "cpm.localReports";
const DEVICE_KEY = "cpm.deviceId";

function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}
/** Random per-browser ID used only to de-duplicate "I face this too" votes and rate-limit reports. */
export function deviceId(): string {
  const s = storage();
  let id = s?.getItem(DEVICE_KEY) ?? "";
  if (!id) {
    id = crypto.randomUUID();
    try { s?.setItem(DEVICE_KEY, id); } catch { /* private mode: a new ID per visit is acceptable */ }
  }
  return id;
}
function localReports(): CitizenReport[] {
  try { return JSON.parse(storage()?.getItem(LOCAL_KEY) ?? "[]"); } catch { return []; }
}
function saveLocal(list: CitizenReport[]) {
  try { storage()?.setItem(LOCAL_KEY, JSON.stringify(list)); } catch { /* storage full or blocked */ }
}

export type Backend = "neon" | "local" | "device";
export interface ReportsState { reports: CitizenReport[]; backend: Backend }

/** Loads citizen reports. Falls back to reports saved on this device when the API has no database. */
export async function fetchReports(): Promise<ReportsState> {
  try {
    const res = await fetch("/api/reports");
    if (res.ok) {
      const body = await res.json();
      return { reports: body.reports.map(normalise), backend: body.database };
    }
  } catch { /* offline or static hosting without functions */ }
  return { reports: localReports(), backend: "device" };
}

export interface NewReport { category: string; description: string; landmark: string; lat: number; lon: number; ward: string }

export async function submitReport(r: NewReport, backend: Backend): Promise<CitizenReport> {
  if (backend !== "device") {
    const res = await fetch("/api/reports", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...r, deviceId: deviceId() }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `The server answered HTTP ${res.status}. Try again.`);
    return normalise(body.report);
  }
  const report: CitizenReport = {
    id: `LOCAL-${Date.now().toString(36).toUpperCase()}`, reported_at: new Date().toISOString(), category: r.category,
    description: r.description, landmark: r.landmark || null, ward: r.ward, lat: r.lat, lon: r.lon, status: "Open", supporters: 0, local: true,
  };
  saveLocal([report, ...localReports()]);
  return report;
}

export async function supportReport(id: string): Promise<{ supporters: number; alreadySupported: boolean }> {
  const res = await fetch(`/api/reports/${encodeURIComponent(id)}/support`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId: deviceId() }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Could not record your vote. Try again.");
  return body;
}

function normalise(r: any): CitizenReport {
  return { ...r, lat: +r.lat, lon: +r.lon, supporters: +r.supporters, reported_at: new Date(r.reported_at).toISOString() };
}
