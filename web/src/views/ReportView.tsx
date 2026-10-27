import { useCallback, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2Icon, InfoIcon } from "lucide-react";
import MapView from "../components/MapView";
import { MapLayout } from "../components/MapLayout";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { PlaceSearch } from "../components/common";
import { CATEGORIES, LIMITS } from "../../shared/categories";
import { wardAt } from "../../shared/geo";
import wardsGeo from "../../shared/wards.geo";
import { WARD_BY_CODE, wardLabel } from "../data";
import { submitReport, type Backend } from "../api";
import type { CitizenReport, Place, Problem } from "../types";
import { fmt } from "../stats";

interface Props {
  rows: Problem[]; reports: CitizenReport[]; place: Place | null; backend: Backend; dark: boolean;
  onCreated: (r: CitizenReport) => void; onViewOnMap: (r: CitizenReport) => void;
}

export default function ReportView({ rows, reports, place, backend, dark, onCreated, onViewOnMap }: Props) {
  const start = useMemo<[number, number]>(() => {
    if (place?.lat !== undefined && place.lon !== undefined) return [place.lat, place.lon];
    if (place) return WARD_BY_CODE.get(place.ward)!.centroid;
    return [19.076, 72.8777];
  }, [place]);
  const [pin, setPin] = useState<{ lat: number; lon: number }>({ lat: start[0], lon: start[1] });
  const [view, setView] = useState({ center: start, zoom: place ? 17 : 12, key: "start" });
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [landmark, setLandmark] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<CitizenReport | null>(null);

  const ward = useMemo(() => wardAt(wardsGeo.features, pin.lat, pin.lon), [pin]);
  const onPick = useCallback((lat: number, lon: number) => setPin({ lat, lon }), []);
  const nearby = useMemo(() => {
    const d = 0.0025;
    return rows.filter((r) => Math.abs(r.lat - pin.lat) < d && Math.abs(r.lon - pin.lon) < d && r.isOpen && (!category || r.category === category)).length;
  }, [rows, pin, category]);

  const problems = {
    category: !category ? "Choose what kind of problem this is." : "",
    description: description.trim().length < 10 ? "Describe the problem in at least 10 characters, for example its size or how long it has been there." : "",
    ward: !ward ? "The pin is outside BMC's 26 wards. Move the map so the pin sits on the problem." : "",
  };
  const valid = !problems.category && !problems.description && !problems.ward;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true); setErr("");
    if (!valid || !ward) return;
    setBusy(true);
    try {
      const r = await submitReport({ category, description: description.trim(), landmark: landmark.trim(), lat: +pin.lat.toFixed(6), lon: +pin.lon.toFixed(6), ward }, backend);
      onCreated(r); setDone(r);
    } catch (x) {
      setErr((x as Error).message);
    }
    setBusy(false);
  };

  if (done) {
    const panel = (
      <>
        <div className="flex flex-col gap-1.5">
          <div className="label-small flex items-center gap-1.5 text-status-resolved"><CheckCircle2Icon className="size-4" aria-hidden="true" />Report filed</div>
          <h1 className="title-h5 text-balance">Thanks. Your report is on the map.</h1>
          <p className="body-medium">Tracking ID <span className="mono-small">{done.id}</span></p>
          <p className="body-medium text-pretty text-muted-foreground">
            {done.local
              ? "The reports database is not connected yet, so this report is saved on this device only. Other residents cannot see it."
              : `Residents of ${wardLabel(done.ward)} can now see it and add “I face this too”.`}
          </p>
        </div>
        <Alert>
          <InfoIcon />
          <AlertTitle>This app does not file with BMC</AlertTitle>
          <AlertDescription className="text-pretty">To get BMC to act, also register the complaint on the MyBMC app, the BMC website or the 1916 helpline. Mention the landmark you gave here.</AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onViewOnMap(done)}>View On Map</Button>
          <Button variant="ghost" onClick={() => { setDone(null); setDescription(""); setLandmark(""); setCategory(""); setTried(false); }}>Report Another Problem</Button>
        </div>
      </>
    );
    return <MapLayout label="Report filed" panel={panel} map={
      <MapView rows={[]} reports={reports} point={{ lat: done.lat, lon: done.lon }} view={{ center: [done.lat, done.lon], zoom: 17, key: done.id }} dark={dark} />
    } />;
  }

  const hint = CATEGORIES.find((c) => c.name === category)?.hint;
  const panel = (
    <form onSubmit={submit} noValidate aria-label="Report a problem" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="title-h5">Report a problem</h1>
        <p className="body-medium text-pretty text-muted-foreground">It appears on the public map for your neighbours. No name or phone number needed.</p>
      </div>

      <FieldSet>
        <FieldLegend>Where is it?</FieldLegend>
        <FieldDescription>Move the map so the pin sits on the problem, or search.</FieldDescription>
        <PlaceSearch onFound={(p) => { setPin({ lat: p.lat, lon: p.lon }); setView({ center: [p.lat, p.lon], zoom: 18, key: `${p.lat},${p.lon}` }); }} />
        <div role="status" className={cn("body-small flex flex-wrap items-baseline gap-x-2 rounded-md bg-muted px-3 py-2", tried && problems.ward && "text-destructive")}>
          {ward ? <><span className="label-small">{wardLabel(ward)}</span><span className="text-muted-foreground">{WARD_BY_CODE.get(ward)?.areas}</span>
            <span className="mono-x-small text-muted-foreground tabular-nums">{pin.lat.toFixed(5)}, {pin.lon.toFixed(5)}</span></> : problems.ward}
        </div>
      </FieldSet>

      <FieldGroup>
        <Field data-invalid={tried && !!problems.category}>
          <FieldLabel htmlFor="category">What is the problem?</FieldLabel>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="category" className="w-full" aria-invalid={tried && !!problems.category}><SelectValue placeholder="Choose a problem type" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>{CATEGORIES.filter((c) => c.reportable).map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectGroup>
            </SelectContent>
          </Select>
          {tried && problems.category ? <FieldError>{problems.category}</FieldError> : hint && <FieldDescription>{hint}</FieldDescription>}
          {category && nearby > 0 && (
            <FieldDescription>{fmt.int(nearby)} open {category.toLowerCase()} {nearby === 1 ? "complaint is" : "complaints are"} already within about 250 m in BMC's data.</FieldDescription>
          )}
        </Field>

        <Field data-invalid={tried && !!problems.description}>
          <FieldLabel htmlFor="desc">Describe it</FieldLabel>
          <Textarea id="desc" maxLength={LIMITS.description} value={description} aria-invalid={tried && !!problems.description}
            placeholder="Example: Deep pothole in the left lane, about 1 m wide. Bikes swerve into traffic." onChange={(e) => setDescription(e.target.value)} />
          {tried && problems.description
            ? <FieldError>{problems.description}</FieldError>
            : <FieldDescription className="tabular-nums">{description.length} / {LIMITS.description}</FieldDescription>}
        </Field>

        <Field>
          <FieldLabel htmlFor="landmark">Nearest landmark <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
          <Input id="landmark" maxLength={LIMITS.landmark} value={landmark} placeholder="Example: Opposite Andheri station east exit" onChange={(e) => setLandmark(e.target.value)} />
        </Field>
      </FieldGroup>

      {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy && <Spinner data-icon="inline-start" />}{busy ? "Submitting…" : "Submit Report"}</Button>
        {backend === "device" && <p className="body-small text-center text-pretty text-muted-foreground">The reports database is not connected yet, so your report is saved on this device only.</p>}
      </div>
    </form>
  );

  return <MapLayout label="Report a problem" panel={panel} map={<MapView rows={[]} reports={reports} pickMode onPick={onPick} view={view} dark={dark} />} />;
}
