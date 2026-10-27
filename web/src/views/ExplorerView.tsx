import { useMemo, useState, type ReactNode } from "react";
import { ChevronDownIcon, DownloadIcon, RotateCcwIcon } from "lucide-react";
import type { Filters, GroupBy, Metric, Problem, QuerySpec } from "../types";
import { GROUPS, METRICS, applyFilters, dateRangeError, download, effectiveMetric, runQuery, toCsv, toSql } from "../query";
import { CATEGORY_NAMES, STATUSES } from "../../shared/categories";
import { WARDS, wardLabel } from "../data";
import { fmt } from "../stats";
import { EvilBarChart } from "@/components/evilcharts/charts/recharts-bar-chart";
import { EvilLineChart } from "@/components/evilcharts/charts/recharts-line-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/recharts-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** Validated categorical palette (dataviz reference slots 1 to 6); used only for split series, always with a legend and table. */
const SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"];
const HEAT = { light: ["#fa5d19"], dark: ["#fa5d19"] };
const EMPTY: Filters = { categories: [], wards: [], statuses: [], channels: [], from: "", to: "", search: "" };
const base: QuerySpec = { groupBy: "ward", splitBy: "none", metric: "count", topN: 10, minCount: 0, order: "desc", hotspot: false };
const PRESETS: { id: string; title: string; filters?: Partial<Filters>; spec: QuerySpec }[] = [
  { id: "pothole-wards", title: "Wards With Most Potholes", filters: { categories: ["Potholes"] }, spec: base },
  { id: "pothole-month", title: "Potholes by Month", filters: { categories: ["Potholes"] }, spec: { ...base, groupBy: "month", topN: 0, order: "key" } },
  { id: "slowest", title: "Slowest Categories To Fix", spec: { ...base, groupBy: "category", metric: "median_days", topN: 0, minCount: 100 } },
  { id: "fix-rate", title: "Wards With Lowest Fix Rate", spec: { ...base, metric: "fix_rate", order: "asc", minCount: 200 } },
  { id: "hotspots", title: "Hotspot Wards per 100k", spec: { ...base, metric: "per_100k", topN: 0, hotspot: true } },
  { id: "open-backlog", title: "Open Backlog by Category", spec: { ...base, groupBy: "category", metric: "open_now", topN: 0 } },
  { id: "hour", title: "Complaints by Hour of Day", spec: { ...base, groupBy: "hour", topN: 0, order: "key" } },
  { id: "channel-mix", title: "Filing Channel per Category", spec: { ...base, groupBy: "category", splitBy: "channel", topN: 0 } },
];

/** Multi-select chips for one filter dimension. Long lists start collapsed. */
function ChipFilter({ label, options, value, onChange, collapsed }: {
  label: string; options: { value: string; label: string; title?: string }[]; value: string[]; onChange: (v: string[]) => void; collapsed?: boolean;
}) {
  const [open, setOpen] = useState(!collapsed);
  const chips = (
    <ToggleGroup type="multiple" variant="outline" size="sm" spacing={1.5} value={value} onValueChange={onChange} aria-label={label} className="flex-wrap">
      {options.map((o) => <ToggleGroupItem key={o.value} value={o.value} title={o.title} className="rounded-full">{o.label}</ToggleGroupItem>)}
    </ToggleGroup>
  );
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-2">
      <CollapsibleTrigger className="label-small flex items-center justify-between rounded-sm text-left">
        <span>{label}{value.length > 0 && <span className="text-muted-foreground"> · {value.length} selected</span>}</span>
        <ChevronDownIcon className="size-4 text-muted-foreground transition-transform in-data-[state=open]:rotate-180" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent>{chips}</CollapsibleContent>
    </Collapsible>
  );
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full" aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup>{children}</SelectGroup></SelectContent>
      </Select>
    </Field>
  );
}

export default function ExplorerView({ rows, dark }: { rows: Problem[]; dark: boolean }) {
  const [f, setF] = useState<Filters>(EMPTY);
  const [spec, setSpec] = useState<QuerySpec>(base);
  const [preset, setPreset] = useState("");
  const channels = useMemo(() => [...new Set(rows.map((r) => r.channel))].sort(), [rows]);
  const filtered = useMemo(() => applyFilters(rows, f), [rows, f]);
  const result = useMemo(() => runQuery(filtered, spec), [filtered, spec]);
  const sql = useMemo(() => toSql(f, spec), [f, spec]);
  const metric: Metric = effectiveMetric(spec);
  const m = METRICS.find((x) => x.value === metric)!;
  const dateErr = dateRangeError(f);
  const stacked = spec.splitBy !== "none";
  const isTime = spec.groupBy === "month" || spec.groupBy === "hour" || spec.groupBy === "weekday";
  const setFilters = (next: Filters) => { setF(next); setPreset(""); };
  const set = (p: Partial<QuerySpec>) => { setSpec({ ...spec, ...p }); setPreset(""); };
  const num = (v: string) => Math.max(0, Math.floor(Number(v)) || 0);
  const exportRows = () => download("query_result.csv", toCsv(result.rows.map((r) => ({
    [spec.groupBy]: r.key, [metric]: r.value, complaints: r.count,
    ...(r.split ? Object.fromEntries(Object.entries(r.split).map(([k, v]) => [`${spec.splitBy}:${k}`, v])) : {}),
  }))));
  const exportFiltered = () => download("filtered_problems.csv", toCsv(filtered.map(({ month, weekday, isOpen, ...r }) => ({ ...r }))));

  // Chart series keys become CSS variable names, so split values (which can hold spaces) are mapped to s0, s1, …
  type Row = Record<string, string | number>;
  const { data, config, keys } = useMemo((): { data: Row[]; config: ChartConfig; keys: string[] } => {
    if (!stacked) {
      return { data: result.rows.map((r) => ({ name: r.key, value: r.value ?? 0 })), config: { value: { label: m.label, colors: HEAT } }, keys: ["value"] };
    }
    const keys = result.splitKeys.map((_, i) => `s${i}`);
    const config: ChartConfig = Object.fromEntries(result.splitKeys.map((k, i) => [`s${i}`, {
      label: k, colors: { light: [SERIES_LIGHT[i % SERIES_LIGHT.length]], dark: [SERIES_DARK[i % SERIES_DARK.length]] },
    }]));
    const data = result.rows.map((r) => ({ name: r.key, ...Object.fromEntries(result.splitKeys.map((k, i) => [`s${i}`, r.split?.[k] ?? 0])) }));
    return { data, config, keys };
  }, [result, stacked, m.label]);
  const horizontal = !isTime;
  const chartHeight = horizontal ? Math.min(Math.max(data.length * 28 + 56, 240), 760) : 320;

  return (
    <div className="mx-auto grid max-w-7xl gap-6 p-4 pb-24 md:p-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside aria-label="Filters" className="order-last lg:sticky lg:top-6 lg:order-first lg:self-start">
        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle className="label-large">Filters</CardTitle>
            <CardDescription className="body-small tabular-nums">{fmt.int(filtered.length)} of {fmt.int(rows.length)} complaints match</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 px-5">
            <ChipFilter label="Category" options={CATEGORY_NAMES.map((c) => ({ value: c, label: c }))} value={f.categories} onChange={(v) => setFilters({ ...f, categories: v })} />
            <ChipFilter label="Status" options={STATUSES.filter((s) => s !== "Discarded").map((s) => ({ value: s, label: s }))} value={f.statuses} onChange={(v) => setFilters({ ...f, statuses: v })} />
            <ChipFilter label="Ward" collapsed options={WARDS.map((w) => ({ value: w.ward, label: wardLabel(w.ward).replace("Ward ", ""), title: w.areas }))} value={f.wards} onChange={(v) => setFilters({ ...f, wards: v })} />
            <ChipFilter label="Filing channel" collapsed options={channels.map((c) => ({ value: c, label: c }))} value={f.channels} onChange={(v) => setFilters({ ...f, channels: v })} />
            <Separator />
            <Field data-invalid={!!dateErr}>
              <FieldLabel>Reported between</FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                <Input aria-label="From date" type="date" value={f.from} aria-invalid={!!dateErr} onChange={(e) => setFilters({ ...f, from: e.target.value })} />
                <Input aria-label="To date" type="date" value={f.to} aria-invalid={!!dateErr} onChange={(e) => setFilters({ ...f, to: e.target.value })} />
              </div>
              {dateErr && <FieldError>{dateErr} The date filter is ignored until then.</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="type-q">Complaint type contains</FieldLabel>
              <Input id="type-q" placeholder="Example: manhole, leak, hawker" value={f.search} onChange={(e) => setFilters({ ...f, search: e.target.value })} />
            </Field>
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={exportFiltered} disabled={!filtered.length}><DownloadIcon data-icon="inline-start" />Download {fmt.int(filtered.length)} Rows</Button>
              <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY)}><RotateCcwIcon data-icon="inline-start" />Reset Filters</Button>
            </div>
          </CardContent>
        </Card>
      </aside>

      <section aria-label="Query builder" className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="title-h5">Data explorer</h1>
          <p className="body-medium text-pretty text-muted-foreground">Group and compare BMC complaints. Queries run in your browser; the SQL shows the same query against the Neon database.</p>
        </div>
        <ToggleGroup type="single" variant="outline" size="sm" spacing={1.5} className="flex-wrap" aria-label="Example questions"
          value={preset} onValueChange={(id) => { const p = PRESETS.find((x) => x.id === id); if (p) { setF({ ...EMPTY, ...p.filters }); setSpec(p.spec); setPreset(p.id); } }}>
          {PRESETS.map((p) => <ToggleGroupItem key={p.id} value={p.id} className="rounded-full">{p.title}</ToggleGroupItem>)}
        </ToggleGroup>

        <Card className="py-5">
          <CardContent className="px-5">
            <FieldGroup className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <SelectField label="Group by" value={spec.groupBy}
                onChange={(v) => { const g = v as GroupBy; set({ groupBy: g, splitBy: spec.splitBy === g ? "none" : spec.splitBy, order: ["month", "weekday", "hour"].includes(g) ? "key" : spec.order === "key" ? "desc" : spec.order, hotspot: false }); }}>
                {GROUPS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
              </SelectField>
              <SelectField label="Split by" value={spec.splitBy} onChange={(v) => set({ splitBy: v as GroupBy | "none" })}>
                <SelectItem value="none">No split</SelectItem>
                {GROUPS.filter((g) => g.value !== spec.groupBy).map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
              </SelectField>
              <SelectField label="Measure" value={metric} onChange={(v) => set({ metric: v as Metric })}>
                {METRICS.map((x) => <SelectItem key={x.value} value={x.value} disabled={x.value === "per_100k" && spec.groupBy !== "ward"}>{x.label}</SelectItem>)}
              </SelectField>
              <SelectField label="Order" value={spec.order} onChange={(v) => set({ order: v as QuerySpec["order"] })}>
                <SelectItem value="desc">Highest first</SelectItem><SelectItem value="asc">Lowest first</SelectItem><SelectItem value="key">By group name or time</SelectItem>
              </SelectField>
              <div className="grid grid-cols-2 gap-3">
                <Field><FieldLabel htmlFor="top-n">Show top</FieldLabel><Input id="top-n" type="number" min={0} max={200} value={spec.topN} onChange={(e) => set({ topN: num(e.target.value) })} /></Field>
                <Field><FieldLabel htmlFor="min-n">Min per group</FieldLabel><Input id="min-n" type="number" min={0} value={spec.minCount} onChange={(e) => set({ minCount: num(e.target.value) })} /></Field>
              </div>
              <Field orientation="horizontal" className="self-end pb-2.5">
                <Checkbox id="hotspot" checked={spec.hotspot} onCheckedChange={(c) => set({ hotspot: c === true })} />
                <FieldLabel htmlFor="hotspot" className="font-normal">Hotspots only</FieldLabel>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="body-small text-muted-foreground"><span className="label-small text-foreground">{result.rows.length} groups</span> · {m.label} over {fmt.int(result.total)} complaints{result.note ? ` · ${result.note}` : ""}</p>
          <Button variant="outline" size="sm" onClick={exportRows} disabled={!result.rows.length}><DownloadIcon data-icon="inline-start" />Result CSV</Button>
        </div>

        {result.rows.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle className="label-large">No groups match</EmptyTitle>
              <EmptyDescription className="body-small">Remove a filter or lower the minimum complaints per group.</EmptyDescription>
            </EmptyHeader>
            <Button variant="secondary" size="sm" onClick={() => { setFilters(EMPTY); set({ minCount: 0 }); }}>Clear Filters</Button>
          </Empty>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Card className="py-4" role="img" aria-label={`${m.label} by ${spec.groupBy}`}>
              <CardContent className="px-4" style={{ height: chartHeight }}>
                {isTime && !stacked ? (
                  <EvilLineChart key={`line-${dark}`} data={data} config={config} className="aspect-auto size-full">
                    <EvilLineChart.Grid />
                    <EvilLineChart.XAxis dataKey="name" />
                    <EvilLineChart.YAxis width={48} tickFormatter={(v: number) => fmt.int(v)} />
                    <EvilLineChart.Tooltip />
                    <EvilLineChart.Line dataKey="value">
                      <EvilLineChart.Dot variant="border" />
                      <EvilLineChart.ActiveDot variant="colored-border" />
                    </EvilLineChart.Line>
                  </EvilLineChart>
                ) : (
                  <EvilBarChart key={`bar-${horizontal}-${keys.length}`} data={data} config={config} layout={horizontal ? "horizontal" : "vertical"}
                    stackType={stacked ? "stacked" : "default"} barRadius={3} className="aspect-auto size-full">
                    <EvilBarChart.Grid />
                    {horizontal ? (
                      <>
                        <EvilBarChart.YAxis dataKey="name" width={128} interval={0} tickFormatter={(v: string) => (v.length > 18 ? v.slice(0, 17) + "…" : v)} />
                        <EvilBarChart.XAxis tickFormatter={(v: number) => fmt.int(v)} />
                      </>
                    ) : (
                      <>
                        <EvilBarChart.XAxis dataKey="name" />
                        <EvilBarChart.YAxis width={48} tickFormatter={(v: number) => fmt.int(v)} />
                      </>
                    )}
                    {stacked && <EvilBarChart.Legend align="left" isClickable />}
                    <EvilBarChart.Tooltip />
                    {keys.map((k) => <EvilBarChart.Bar key={k} dataKey={k} isClickable={stacked} />)}
                  </EvilBarChart>
                )}
              </CardContent>
            </Card>
            <Card className="max-h-[480px] overflow-auto py-0">
              <Table className="body-small">
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>{GROUPS.find((g) => g.value === spec.groupBy)!.label}</TableHead>
                    <TableHead className="text-right">{m.label}</TableHead>
                    {metric !== "count" && <TableHead className="text-right">Complaints</TableHead>}
                    {stacked && result.splitKeys.map((k) => <TableHead key={k} className="text-right">{k}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((r, i) => (
                    <TableRow key={r.key}>
                      <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                      <TableCell>{r.key}</TableCell>
                      <TableCell className="mono-x-small text-right tabular-nums">{r.value ?? "No data"}</TableCell>
                      {metric !== "count" && <TableCell className="mono-x-small text-right tabular-nums">{fmt.int(r.count)}</TableCell>}
                      {stacked && result.splitKeys.map((k) => <TableCell key={k} className="mono-x-small text-right tabular-nums">{r.split?.[k] ?? 0}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        )}

        <Collapsible className="flex flex-col gap-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="self-start text-muted-foreground">Equivalent SQL<ChevronDownIcon data-icon="inline-end" className="transition-transform in-data-[state=open]:rotate-180" /></Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mono-x-small overflow-auto rounded-md border bg-card px-4 py-3"><code className="break-words whitespace-pre-wrap">{sql}</code></pre>
          </CollapsibleContent>
        </Collapsible>
      </section>
    </div>
  );
}
