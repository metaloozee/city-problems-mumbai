import { useMemo, useState } from "react";
import MapView from "../components/MapView";
import { MapLayout } from "../components/MapLayout";
import { cn } from "@/lib/utils";
import { useDesktop } from "@/hooks/use-media";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Problem } from "../types";
import { WARDS, wardLabel } from "../data";
import { fmt, statsByWard, type AreaStats } from "../stats";
import { PeriodToggle, periodStart, type Period } from "./AreaView";

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
  const desktop = useDesktop();
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

  const panel = (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="title-h5 text-balance">How does your ward compare?</h1>
        <p className="body-medium text-pretty text-muted-foreground">All 26 BMC wards, best first. Select one to see its problems.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Select value={metric} onValueChange={(v) => setMetric(v as Key)}>
          <SelectTrigger className="w-full" aria-label="Rank by"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectGroup>{METRICS.map((x) => <SelectItem key={x.key} value={x.key}>{x.label}</SelectItem>)}</SelectGroup>
          </SelectContent>
        </Select>
        <p className="body-small text-pretty text-muted-foreground">{m.help}</p>
        {metric !== "open" && <PeriodToggle value={period} onChange={setPeriod} />}
      </div>
      <ol className="divide-y rounded-xl border bg-card">
        {ranked.map((w, i) => {
          const v = values.get(w.ward) ?? null;
          return (
            <li key={w.ward}>
              <button type="button" onClick={() => onOpenWard(w.ward)}
                onMouseEnter={() => setHover(w.ward)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(w.ward)} onBlur={() => setHover(null)}
                className={cn("grid w-full grid-cols-[1.75rem_1fr_auto] items-center gap-2 px-4 py-2.5 text-left first:rounded-t-xl last:rounded-b-xl hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none",
                  hover === w.ward && "bg-secondary")}>
                <span className="mono-x-small text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="flex min-w-0 flex-col">
                  <span className="label-medium">{wardLabel(w.ward)}</span>
                  <span className="body-small truncate text-muted-foreground">{w.areas}</span>
                </span>
                <span className="mono-small tabular-nums">{v === null ? "No data" : m.format(v)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );

  return (
    <MapLayout label="Ward rankings" panel={panel} map={
      <MapView rows={[]} reports={[]} choropleth={choropleth} highlightWard={hover} onWardClick={onOpenWard} dark={dark}
        view={{ center: [19.08, 72.88], zoom: desktop ? 11 : 10, key: `overview-${desktop}` }} />
    } />
  );
}
