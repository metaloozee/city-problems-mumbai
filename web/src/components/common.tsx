import { useState, type ReactNode } from "react";
import { MUMBAI_BBOX } from "../../shared/categories";
import { statusKind } from "./MapView";

export function StatusBadge({ status, citizen }: { status: string; citizen?: boolean }) {
  const kind = citizen ? "citizen" : statusKind(status);
  const icon = kind === "resolved" ? "✓" : kind === "closed" ? "–" : "!";
  return (
    <span className={`badge badge--${kind} label-x-small`}>
      <span className="badge-icon" aria-hidden="true">{citizen ? "●" : icon}</span>
      {citizen ? "Resident report" : status}
    </span>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: ReactNode }) {
  return (
    <div className="stat">
      <div className="label-small muted">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="body-small muted">{note}</div>}
    </div>
  );
}

export interface FoundPlace { lat: number; lon: number; label: string }

/** Place search (OpenStreetMap Nominatim, Mumbai only, on submit) plus "Use My Location". */
export function PlaceSearch({ onFound, compact }: { onFound: (p: FoundPlace) => void; compact?: boolean }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<"" | "search" | "gps">("");
  const [msg, setMsg] = useState("");
  const [results, setResults] = useState<FoundPlace[]>([]);
  const b = MUMBAI_BBOX;

  const search = async () => {
    if (q.trim().length < 3) { setMsg("Type at least 3 letters of a place, road or landmark."); return; }
    setBusy("search"); setMsg(""); setResults([]);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&bounded=1&countrycodes=in&viewbox=${b.lonMin},${b.latMax},${b.lonMax},${b.latMin}&q=${encodeURIComponent(q.trim())}`;
      const res = await fetch(url, { headers: { "Accept-Language": "en" } });
      const list = (await res.json()) as { lat: string; lon: string; display_name: string }[];
      const found = list.map((r) => ({ lat: +r.lat, lon: +r.lon, label: r.display_name.split(",").slice(0, 3).join(",") }));
      if (!found.length) setMsg(`No place in Mumbai matches “${q.trim()}”. Try a nearby landmark or station.`);
      else if (found.length === 1) { onFound(found[0]); setQ(""); }
      else setResults(found);
    } catch {
      setMsg("Place search is unavailable right now. Tap the map or pick your ward instead.");
    }
    setBusy("");
  };

  const locate = () => {
    if (!navigator.geolocation) { setMsg("This browser cannot share your location. Search for a place instead."); return; }
    setBusy("gps"); setMsg("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy("");
        const { latitude: lat, longitude: lon } = pos.coords;
        if (lat < b.latMin || lat > b.latMax || lon < b.lonMin || lon > b.lonMax) setMsg("Your location is outside Mumbai. Search for a place in Mumbai instead.");
        else onFound({ lat, lon, label: "Your location" });
      },
      () => { setBusy(""); setMsg("Location access was blocked. Allow it in your browser settings, or search for a place."); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="place-search">
      {/* Not a <form>: this component sits inside the report form, and forms cannot nest. */}
      <div className="search-row" role="search">
        <label className="sr-only" htmlFor="place-q">Search a place in Mumbai</label>
        <input id="place-q" className={"fc-input body-input" + (compact ? " fc-input--sm" : "")} placeholder="Search a road, station or landmark"
          value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }} />
        <button className={"fc-btn fc-btn--secondary label-medium" + (compact ? " fc-btn--sm" : "")} type="button" onClick={search} disabled={busy !== ""}>
          {busy === "search" ? "Searching…" : "Search"}
        </button>
      </div>
      <button className={"fc-btn fc-btn--tertiary label-medium locate" + (compact ? " fc-btn--sm" : "")} type="button" onClick={locate} disabled={busy !== ""}>
        <span aria-hidden="true">◎</span> {busy === "gps" ? "Finding You…" : "Use My Location"}
      </button>
      {msg && <p className="body-small muted" role="status">{msg}</p>}
      {results.length > 0 && (
        <ul className="results" aria-label="Matching places">
          {results.map((r, i) => (
            <li key={i}><button type="button" className="result-btn body-small" onClick={() => { onFound(r); setResults([]); setQ(""); }}>{r.label}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}
