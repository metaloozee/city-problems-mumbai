import { useMemo, useState } from "react";
import MapView from "../components/MapView";
import type { Problem } from "../types";
import { WARDS, wardLabel } from "../data";
import { fmt, statsByWard, type AreaStats } from "../stats";
import { periodStart, type Period } from "./AreaView";

type Key = "per100k" | "open" | "fixRate" | "medianDays";
const METRICS: { key: Key; label: string; higherIsWorse: boolean; format: (v: number) => string; help: string }[] = [
  { key: "fixRate", label: "Fix Rate", higherIsWorse: false, format: (v) => `${v.toFixed(0)}%`, help: "Share of closed complaints that BMC closed as fixed rather than invalid." },
  { key: "medianDays", label: "Median Days To Fix", higherIsWorse: true, format: (v) => v.toFixed(1), help: "Half of fixed complaints took longer than this." },
  { key: "open", label: "Open Now", higherIsWorse: true, format: (v) => fmt.int(v), help: "Complaints still open, new, in review or in progress." },
  { key: "per100k", label: "Complaints per 100k Residents", higherIsWorse: true, format: (v) => fmt.int(Math.round(v)), help: "Complaints filed, scaled by ward population." },
];

interface Props { rows: Problem[]; dataEnd: string; dark: boolean; onOpenWard: (ward: string) => void }

export default function OverviewView({ rows, dataEnd, dark, onOpenWard }: Props) {
  const [metric, setMetric] = useState<Key>("fixRate");
  const [period, setPeriod] = useState<Period>("all");
  const [hover, setHover] = useState<string | null>(null);
  const m = METRICS.find((x) => x.key === metric)!;
  const since = periodStart(period, dataEnd);
  const byWard = useMemo(() => statsByWard(since ? rows.filter((r) => r.date >= since) : rows), [rows, since]);
  const openByWard = useMemo(() => {
    const o = new Map<string, number>();
    for (const r of rows) if (r.isOpen) o.set(r.ward, (o.get(r.ward) ?? 0) + 1);
    return o;
  }, [rows]);
  const value = (w: string, s: AreaStats | undefined): number | null =>
    metric === "open" ? openByWard.get(w) ?? 0 : !s ? null : metric === "per100k" ? s.per100k : metric === "fixRate" ? s.fixRate : s.medianDays;
  const values = useMemo(() => new Map(WARDS.map((w) => [w.ward, value(w.ward, byWard.get(w.ward))])), [byWard, metric, openByWard]);
  const ranked = useMemo(
    () => [...WARDS].sort((a, b) => {
      const va = values.get(a.ward) ?? null, vb = values.get(b.ward) ?? null;
      if (va === null) return 1; if (vb === null) return -1;
      return m.higherIsWorse ? va - vb : vb - va;
    }),
    [values, m],
  );
  const choropleth = useMemo(() => ({ values, label: m.label, format: m.format, higherIsWorse: m.higherIsWorse }), [values, m]);

  return (
    <div className="split">
      <aside className="panel" aria-label="Ward rankings">
        <h1 className="title-h5">How does your ward compare?</h1>
        <p className="body-medium muted">All 26 BMC wards, ranked best first. Select a ward to see its problems.</p>
        <div className="seg seg--wrap" role="group" aria-label="Rank by">
          {METRICS.map((x) => (
            <button key={x.key} type="button" aria-pressed={metric === x.key} onClick={() => setMetric(x.key)} className="label-small">{x.label}</button>
          ))}
        </div>
        <p className="body-small muted">{m.help}</p>
        {metric !== "open" && (
          <div className="seg" role="group" aria-label="Time period">
            {(["30", "90", "all"] as Period[]).map((p) => (
              <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)} className="label-small">{p === "all" ? "All Data" : `Last ${p} Days`}</button>
            ))}
          </div>
        )}
        <ol className="rank">
          {ranked.map((w, i) => {
            const v = values.get(w.ward) ?? null;
            return (
              <li key={w.ward}>
                <button type="button" className={"rank-row" + (hover === w.ward ? " hover" : "")} onClick={() => onOpenWard(w.ward)}
                  onMouseEnter={() => setHover(w.ward)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(w.ward)} onBlur={() => setHover(null)}>
                  <span className="mono-x-small muted rank-n">{i + 1}</span>
                  <span className="rank-name"><span className="label-medium">{wardLabel(w.ward)}</span><span className="body-small muted">{w.areas}</span></span>
                  <span className="mono-small">{v === null ? "No data" : m.format(v)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>
      <MapView rows={[]} reports={[]} choropleth={choropleth} highlightWard={hover} onWardClick={onOpenWard} dark={dark}
        view={{ center: [19.08, 72.88], zoom: 11, key: "overview" }} />
    </div>
  );
}
