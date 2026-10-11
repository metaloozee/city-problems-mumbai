import type { Filters } from "../types";
import { CAT_COLORS } from "../colors";

interface Props {
  f: Filters; set: (f: Filters) => void; categories: { name: string; n: number }[]; wards: string[]; statuses: string[];
  minDate: string; maxDate: string; shown: number; total: number; onReset: () => void;
}
function toggle(list: string[], v: string) { return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]; }

export default function FiltersPanel({ f, set, categories, wards, statuses, minDate, maxDate, shown, total, onReset }: Props) {
  return (
    <aside className="panel filters">
      <div className="panel-h">
        <h2>Filters</h2>
        <button className="link" onClick={onReset}>Reset</button>
      </div>
      <p className="muted small">Showing <b>{shown.toLocaleString()}</b> of {total.toLocaleString()} complaints</p>

      <label className="lbl">Category</label>
      <div className="checks">
        {categories.map((c) => (
          <label key={c.name} className="chk">
            <input type="checkbox" checked={f.categories.includes(c.name)} onChange={() => set({ ...f, categories: toggle(f.categories, c.name) })} />
            <span className="dot" style={{ background: CAT_COLORS[c.name] }} /> {c.name} <em>{c.n.toLocaleString()}</em>
          </label>
        ))}
      </div>

      <label className="lbl">Status</label>
      <div className="chips">
        {statuses.map((s) => (
          <button key={s} className={"chip" + (f.statuses.includes(s) ? " on" : "")} onClick={() => set({ ...f, statuses: toggle(f.statuses, s) })}>{s}</button>
        ))}
      </div>

      <label className="lbl">Ward {f.wards.length > 0 && <button className="link" onClick={() => set({ ...f, wards: [] })}>clear ({f.wards.length})</button>}</label>
      <div className="chips wards">
        {wards.map((w) => (
          <button key={w} className={"chip sm" + (f.wards.includes(w) ? " on" : "")} onClick={() => set({ ...f, wards: toggle(f.wards, w) })}>{w}</button>
        ))}
      </div>

      <label className="lbl">Date range</label>
      <div className="row2">
        <input type="date" value={f.from} min={minDate} max={maxDate} onChange={(e) => set({ ...f, from: e.target.value })} />
        <input type="date" value={f.to} min={minDate} max={maxDate} onChange={(e) => set({ ...f, to: e.target.value })} />
      </div>

      <label className="lbl">Resolution delay ≥ <b>{f.minDelay}</b> days <span className="muted small">(severity proxy, closed only)</span></label>
      <input type="range" min={0} max={120} step={5} value={f.minDelay} onChange={(e) => set({ ...f, minDelay: +e.target.value })} />

      <label className="lbl">Complaint type contains</label>
      <input type="text" placeholder="e.g. manhole, leak, hawker" value={f.search} onChange={(e) => set({ ...f, search: e.target.value })} />
    </aside>
  );
}
