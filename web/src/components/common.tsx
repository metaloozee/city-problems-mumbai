import { useState, type ReactNode } from "react";
import { InfoIcon, LocateFixedIcon, SearchIcon } from "lucide-react";
import { MUMBAI_BBOX } from "../../shared/categories";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const STATUS_STYLE = {
  open: { color: "var(--status-open)", hex: "#d97706", label: "Open" },
  resolved: { color: "var(--status-resolved)", hex: "#16a34a", label: "Resolved" },
  closed: { color: "var(--status-closed)", hex: "#8f8f8f", label: "Rejected" },
  citizen: { color: "var(--status-citizen)", hex: "#2a6dfb", label: "Resident report" },
};
export type StatusKind = keyof typeof STATUS_STYLE;
export const statusKind = (status: string): Exclude<StatusKind, "citizen"> =>
  status === "Resolved" ? "resolved" : status === "Rejected" || status === "Discarded" ? "closed" : "open";

export function StatusDot({ kind, className }: { kind: StatusKind; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-block size-2.5 shrink-0 rounded-full ring-1 ring-black/10", kind === "citizen" && "rounded-[3px]", className)}
      style={{ background: STATUS_STYLE[kind].color }} />
  );
}

export function StatusBadge({ status, citizen }: { status: string; citizen?: boolean }) {
  const kind = citizen ? "citizen" : statusKind(status);
  return (
    <Badge variant="outline" className="label-x-small gap-1.5 bg-card">
      <StatusDot kind={kind} className="size-2" />
      {citizen ? "Resident report" : status}
    </Badge>
  );
}

export function Stat({ label, value, note, hint }: { label: string; value: string; note?: ReactNode; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="label-x-small flex items-center gap-1 text-muted-foreground">
        {label}
        {hint && (
          <Tooltip>
            <TooltipTrigger className="rounded-sm text-muted-foreground hover:text-foreground" aria-label={`About ${label}`}>
              <InfoIcon className="size-3" />
            </TooltipTrigger>
            <TooltipContent className="max-w-60 text-pretty">{hint}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="stat-value">{value}</div>
      {note && <div className="body-small text-pretty text-muted-foreground">{note}</div>}
    </div>
  );
}

export interface FoundPlace { lat: number; lon: number; label: string }

/** Place search (OpenStreetMap Nominatim, Mumbai only, on submit) plus "Use My Location". */
export function PlaceSearch({ onFound }: { onFound: (p: FoundPlace) => void }) {
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
    <div className="flex flex-col gap-2">
      {/* Not a <form>: this component sits inside the report form, and forms cannot nest. */}
      <div className="flex gap-2" role="search">
        <div className="relative flex-1">
          <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search a place in Mumbai" className="pl-9" placeholder="Search a road, station or landmark"
            value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }} />
        </div>
        <Button variant="secondary" type="button" onClick={search} disabled={busy !== ""}>
          {busy === "search" && <Spinner data-icon="inline-start" />}Search
        </Button>
      </div>
      <Button variant="ghost" size="sm" type="button" className="-ml-2 self-start text-muted-foreground" onClick={locate} disabled={busy !== ""}>
        {busy === "gps" ? <Spinner data-icon="inline-start" /> : <LocateFixedIcon data-icon="inline-start" />}
        {busy === "gps" ? "Finding You…" : "Use My Location"}
      </Button>
      {msg && <p className="body-small text-pretty text-muted-foreground" role="status">{msg}</p>}
      {results.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-md border bg-card" aria-label="Matching places">
          {results.map((r, i) => (
            <li key={i}>
              <button type="button" className="body-small w-full px-3 py-2 text-left hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
                onClick={() => { onFound(r); setResults([]); setQ(""); }}>{r.label}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
