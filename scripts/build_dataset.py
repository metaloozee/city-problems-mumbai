"""Build ONE uniform Mumbai civic-problems dataset from the raw BMC MARG downloads.

Inputs  (data/raw/, written by scripts/download_raw.py):
  complaints_raw.json.gz   layer 0  CCRS complaints (all departments, all channels)
  potholes_raw.json        layer 16 Pothole QuickFix (mostly the same complaints as layer 0, with pothole fields)
  ward_boundary_raw.json   layer 2  26 ward polygons with population

Outputs:
  data/processed/problems.csv.gz   full unified table, one row per complaint (seed for the Neon `problems` table)
  data/processed/wards.csv         ward lookup (code, name, areas, zone, population)
  web/public/data/problems.csv     compact subset the web app loads (mapped rows only)
  web/shared/wards.geo.ts          simplified ward polygons with names (imported by the app and the API)
  data/prepare_stats.json          counts for every cleaning step

Run:  python3 scripts/build_dataset.py      then  python3 scripts/eda.py
"""
import gzip, json, pathlib, re
import pandas as pd
from shapely.geometry import shape, Point
from shapely import STRtree

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
PROC = ROOT / "data" / "processed"
WEB = ROOT / "web" / "public" / "data"
PROC.mkdir(parents=True, exist_ok=True); WEB.mkdir(parents=True, exist_ok=True)
BBOX = (18.85, 19.35, 72.75, 73.05)          # lat min/max, lon min/max (Greater Mumbai)
PLACEHOLDER = (19.07766, 72.87741)           # one point stamped on >14k "1916" helpline rows with no real location
TZ = "Asia/Kolkata"                          # MARG stores UTC epoch ms; citizens think in IST
stats = {}

# ---------- ward lookup: code -> display name, well-known areas (for "find my area")
WARDS = {
    "A": ("A", "Colaba, Fort, Cuffe Parade"), "B": ("B", "Dongri, Masjid Bunder, Sandhurst Road"),
    "C": ("C", "Marine Lines, Kalbadevi, Bhuleshwar"), "D": ("D", "Grant Road, Malabar Hill, Tardeo"),
    "E": ("E", "Byculla, Mazgaon, Agripada"), "FN": ("F/North", "Matunga, Sion, Wadala"),
    "FS": ("F/South", "Parel, Sewri, Lalbaug"), "GN": ("G/North", "Dadar, Mahim, Dharavi"),
    "GS": ("G/South", "Worli, Prabhadevi, Lower Parel"), "HE": ("H/East", "Bandra East, Khar East, Santacruz East"),
    "HW": ("H/West", "Bandra West, Khar West, Santacruz West"), "KS": ("K/South", "Andheri East, Vile Parle East"),
    "KN": ("K/North", "Jogeshwari East, Marol"), "KW": ("K/West", "Andheri West, Vile Parle West, Juhu"),
    "L": ("L", "Kurla, Sakinaka, Chandivali"), "ME": ("M/East", "Govandi, Mankhurd, Deonar"),
    "MW": ("M/West", "Chembur, Tilak Nagar"), "N": ("N", "Ghatkopar, Vikhroli"),
    "PS": ("P/South", "Goregaon"), "PE": ("P/East", "Malad East"), "PW": ("P/West", "Malad West, Marve, Madh"),
    "RS": ("R/South", "Kandivali"), "RC": ("R/Central", "Borivali"), "RN": ("R/North", "Dahisar"),
    "S": ("S", "Bhandup, Powai, Kanjurmarg"), "T": ("T", "Mulund"),
}

# ---------- categories: classify on what the citizen picked (complaint name) first, department second
CATEGORY_RULES = [  # (category, regex on complaint name) - first match wins
    ("Potholes", r"pothole"),
    ("Street Lights", r"street light|electric supply"),
    ("Encroachment & Hawkers", r"hawk|encro|banner|advertisement|structures on nallas|barriers on footpath"),
    ("Drains & Sewage", r"drain|manhole|nullah|nalla|sewer|sewage|septic|swd|culvert|psc block"),
    ("Water Supply", r"water (supply|line|connection|bill|meter|storage)|leaks? / burst|contaminated water|potable|overhead tank|use of water"),
    ("Garbage & Cleanliness", r"garbage|debris|swept|sweeping|dustbin|dead animal|silt|toilet|cleanliness|rank vegetation"),
    ("Illegal Construction", r"unauthori[sz]ed (construction|addition|alteration|use / extension|temporary)|unauthorised alteration|change of user|renonvation"),
    ("Trees & Gardens", r"tree|garden|play ?ground"),
    ("Mosquitoes, Pests & Animals", r"mosquito|rat |fogging|dog|cat[s ]|cattle|caterpillar|nuisance detector|pest"),
    ("Pollution & Noise", r"pollution|noise|odour|smell|masala mill"),
    ("Roads & Footpaths", r"road|footpath|speed brak|zebra|divider|median|traffic signal|signage|trench|crosscut"),
    ("Licences, Tax & Billing", r"licen[cs]e|tax|bill|assess|property transfer|refund|payment|kyc|trade without|certificate"),
]
DEPT_FALLBACK = {
    "Roads and traffic": "Roads & Footpaths", "Bridges": "Roads & Footpaths", "Solid Waste Management": "Garbage & Cleanliness",
    "Drainage": "Drains & Sewage", "Sewerage Operation": "Drains & Sewage", "Storm water drain": "Drains & Sewage",
    "Water supply": "Water Supply", "Encroachment": "Encroachment & Hawkers", "Hawkers": "Encroachment & Hawkers",
    "Garden": "Trees & Gardens", "Pest control": "Mosquitoes, Pests & Animals", "Dog Control Office": "Mosquitoes, Pests & Animals",
    "Cattle Pound Office": "Mosquitoes, Pests & Animals", "Environment": "Pollution & Noise", "Buildings": "Illegal Construction",
    "Licence": "Licences, Tax & Billing", "Shops & Establishment": "Licences, Tax & Billing", "Factories": "Licences, Tax & Billing",
    "Assessment": "Licences, Tax & Billing", "Health": "Public Buildings & Services", "Health /Hospital": "Public Buildings & Services",
    "School": "Public Buildings & Services", "Education": "Public Buildings & Services", "Estate": "Public Buildings & Services",
    "Colony officer": "Public Buildings & Services", "Repairs to municipal property": "Public Buildings & Services",
    "Maintenance": "Public Buildings & Services", "Security": "Public Buildings & Services", "RETMS": "Public Buildings & Services",
    "Zoo": "Public Buildings & Services",
}
# Schools, hospitals and municipal buildings are reported to their own department even when the
# complaint name says "drain" or "water"; keep those under the public building they belong to.
PUBLIC_DEPTS = {"School", "Health /Hospital", "Education"}

def categorise(dept: str, name: str) -> str:
    n = name.lower()
    if dept in PUBLIC_DEPTS or n.startswith(("school -", "health -")):
        return "Public Buildings & Services"
    for cat, rx in CATEGORY_RULES:
        if re.search(rx, n):
            return cat
    return DEPT_FALLBACK.get(dept, "Other")

CHANNELS = {"MyBMC MARG": "MyBMC app", "1916": "1916 helpline", "X": "X (Twitter)", "WHATSAPP": "WhatsApp",
            "WEB PORTAL": "BMC web portal", "INSTAGRAM": "Instagram", "Physical Letters": "Letter", "Emails": "Email"}

def ist(ms):
    return pd.to_datetime(ms, unit="ms", utc=True).dt.tz_convert(TZ)

def clean_id(s):
    """Complaint IDs as trimmed strings; missing IDs become NA (pandas keeps NaN through astype(str))."""
    s = s.astype("string").str.strip()
    return s.where(~s.isin(["", "None", "nan", "NaN"]))

def clean_name(s):
    return s.fillna("").astype(str).str.strip().str.replace(r"\s+", " ", regex=True)

# ---------- layer 0: CCRS complaints
c = pd.DataFrame(json.load(gzip.open(RAW / "complaints_raw.json.gz")))
stats["raw_rows"] = {"ccrs": len(c)}
c = pd.DataFrame({
    "id": clean_id(c.COMPLAINT_ID),
    "department": clean_name(c.COMPLAINT_TYPE),
    "subcategory": clean_name(c.COMPLAINT_NAME),
    "channel": c.COMPLAINT_SOURCE.map(CHANNELS).fillna("Other"),
    "reported_at": ist(c.COMP_REG_DATE),
    "closed_at": ist(c.AFTER_IMAGE_DATE),
    "bmc_status": c.COMPLAINT_STATUS, "invalid": c.INVALID.eq("YES"),
    "lat": c.COMPLAINT_REG_LATITUDE, "lon": c.COMPLAINT_REG_LONGITUDE,
    "ward_raw": c.COMPLAINT_REG_WARD, "zone": c.COMPLAINT_ZONE, "division": c.COMPLAINT_DIVISION,
    "escalated": c.ESCALATED_NEW.eq("YES"),
    "escalation_level": pd.to_numeric(c.CURRENT_ESC_LVL.str.replace("L", "", regex=False), errors="coerce").astype("Int64"),
    "road_type": pd.NA,
})
stats["dropped_missing_id_or_date"] = int((c.id.isna() | c.reported_at.isna()).sum())
c = c[c.id.notna() & c.reported_at.notna()]
stats["duplicate_ids_in_ccrs"] = int(c.id.duplicated().sum())
c = c.drop_duplicates("id")

# ---------- layer 16: Pothole QuickFix. 99.8% of its IDs are already in layer 0, so it ENRICHES those rows.
p = pd.DataFrame(json.load(open(RAW / "potholes_raw.json")))
stats["raw_rows"]["pothole_quickfix"] = len(p)
p = pd.DataFrame({
    "id": clean_id(p.COMPLAINTS_ID), "p_status": p.STATUS, "p_invalid": p.SUBSTATUS.eq("Invalid"),
    "p_resolved": ist(p.RESOLVED_DATE), "p_road_type": p.ROAD_TYPE, "p_created": ist(p.COMPLAINTS_CREATION_DATE),
    "p_lat": p.LATITUDE, "p_lon": p.LONGITUDE, "p_ward": p.WARD_NAME, "p_zone": p.ZONE, "p_division": p.DIVISION,
    "p_channel": p.COMPLAINT_SOURCE.map(CHANNELS).fillna("Other"), "p_escalated": p.ESCALATED.eq("YES"),
})
stats["pothole_rows_without_id_dropped"] = int(p.id.isna().sum())
p = p[p.id.notna()].drop_duplicates("id")
overlap = p.id.isin(c.id)
stats["pothole_rows_matching_ccrs"] = int(overlap.sum())
stats["pothole_rows_only_in_quickfix"] = int((~overlap).sum())
c = c.merge(p[overlap], on="id", how="left")
m = c.p_status.notna()
c.loc[m, "road_type"] = c.loc[m, "p_road_type"]
c.loc[m & c.p_invalid, "invalid"] = True                    # QuickFix marks invalid potholes that CCRS still calls Closed
c.loc[m & c.closed_at.isna(), "closed_at"] = c.loc[m, "p_resolved"]
extra = p[~overlap]
extra = pd.DataFrame({
    "id": extra.id, "department": "Roads and traffic", "subcategory": "Bad patches/potholes on roads", "channel": extra.p_channel,
    "reported_at": extra.p_created, "closed_at": extra.p_resolved,
    "bmc_status": extra.p_status.map({"Resolved": "CLOSED", "In Progress": "IN PROGRESS", "In Review": "IN REVIEW"}),
    "invalid": extra.p_invalid, "lat": extra.p_lat, "lon": extra.p_lon, "ward_raw": extra.p_ward, "zone": extra.p_zone,
    "division": extra.p_division, "escalated": extra.p_escalated, "escalation_level": pd.NA, "road_type": extra.p_road_type,
})
df = pd.concat([c[extra.columns], extra], ignore_index=True)
stats["unified_rows_before_cleaning"] = len(df)

# ---------- status: split BMC "Closed" into Resolved vs Rejected (closed as invalid)
def status(row):
    s = row.bmc_status
    if s == "CLOSED": return "Rejected" if row.invalid else "Resolved"
    return {"IN PROGRESS": "In Progress", "IN REVIEW": "In Review", "NEW": "Open", "DISCARDED": "Discarded"}.get(s)
df["status"] = df.apply(status, axis=1)
stats["dropped_unknown_status"] = int(df.status.isna().sum())
df = df[df.status.notna()].copy()
df["is_open"] = df.status.isin(["Open", "In Review", "In Progress"])
df.loc[df.is_open | (df.status == "Discarded"), "closed_at"] = pd.NaT   # the "after image" date only means closure for closed rows
df["days_to_close"] = ((df.closed_at - df.reported_at).dt.total_seconds() / 86400).round(2)
bad = (df.days_to_close < 0) | (df.days_to_close > 400)
stats["blanked_impossible_days_to_close"] = int(bad.sum())
df.loc[bad, ["days_to_close", "closed_at"]] = [pd.NA, pd.NaT]

# ---------- location
inside = df.lat.between(BBOX[0], BBOX[1]) & df.lon.between(BBOX[2], BBOX[3])
ph = (df.lat.round(5) == PLACEHOLDER[0]) & (df.lon.round(5) == PLACEHOLDER[1])
stats["no_real_location"] = {"outside_mumbai_or_missing": int((~inside).sum()), "placeholder_point": int(ph.sum())}
df["has_location"] = inside & ~ph
df.loc[~df.has_location, ["lat", "lon"]] = [pd.NA, pd.NA]

wg = json.load(open(RAW / "ward_boundary_raw.json"))
geoms = [shape(f["geometry"]) for f in wg["features"]]
codes = [f["properties"]["WARD"] for f in wg["features"]]
tree = STRtree(geoms)
def ward_of(lat, lon):
    pt = Point(lon, lat)
    for i in tree.query(pt):
        if geoms[i].contains(pt): return codes[i]
    return None
df["ward"] = df.ward_raw.where(df.ward_raw.isin(set(codes)))
fix = df.ward.isna() & df.has_location
stats["ward_filled_by_point_in_polygon"] = int(fix.sum())
df.loc[fix, "ward"] = [ward_of(a, b) for a, b in zip(df.lat[fix], df.lon[fix])]
stats["rows_without_ward"] = int(df.ward.isna().sum())
# zone/division are a function of ward; fill gaps from the most common value per ward
for col in ("zone", "division"):
    lut = df.dropna(subset=["ward", col]).groupby("ward")[col].agg(lambda s: s.mode().iat[0])
    df[col] = df[col].fillna(df.ward.map(lut))

df["category"] = [categorise(d, n) for d, n in zip(df.department, df.subcategory)]
df["source"] = "bmc"
df["lat"] = df.lat.astype(float).round(5); df["lon"] = df.lon.astype(float).round(5)

FULL_COLS = ["id", "source", "reported_at", "category", "subcategory", "department", "ward", "zone", "division",
             "lat", "lon", "has_location", "status", "is_open", "closed_at", "days_to_close", "channel",
             "escalated", "escalation_level", "road_type"]
full = df[FULL_COLS].sort_values("reported_at").reset_index(drop=True)
out = full.copy()
for col in ("reported_at", "closed_at"):
    out[col] = out[col].dt.strftime("%Y-%m-%dT%H:%M:%S%z").str.replace(r"(\d\d)(\d\d)$", r"\1:\2", regex=True)
out.to_csv(PROC / "problems.csv.gz", index=False, compression="gzip")

# ---------- compact file for the web app: mapped rows, short column names, IST date and hour
app = full[full.has_location].copy()
app = pd.DataFrame({
    "id": app.id, "d": app.reported_at.dt.strftime("%Y-%m-%d"), "h": app.reported_at.dt.hour,
    "c": app.category, "s": app.subcategory, "w": app.ward, "st": app.status, "lat": app.lat, "lon": app.lon,
    "dc": app.days_to_close.round(1), "ch": app.channel, "esc": app.escalated.astype(int),
})
app.to_csv(WEB / "problems.csv", index=False)
old = WEB / "complaints.csv"
if old.exists(): old.unlink()

# ---------- wards
pop = {f["properties"]["WARD"]: f["properties"]["SUM_POPULA"] for f in wg["features"]}
zone_of = full.dropna(subset=["ward", "zone"]).groupby("ward").zone.agg(lambda s: s.mode().iat[0]).to_dict()
wards = pd.DataFrame([{"ward": k, "name": WARDS[k][0], "areas": WARDS[k][1], "zone": zone_of.get(k), "population": pop[k]} for k in codes])
wards.sort_values("ward").to_csv(PROC / "wards.csv", index=False)
feats = []
for f, g in zip(wg["features"], geoms):
    k = f["properties"]["WARD"]
    gs = g.simplify(0.0004, preserve_topology=True)
    feats.append({"type": "Feature", "properties": {"ward": k, "name": WARDS[k][0], "areas": WARDS[k][1], "population": pop[k],
                  "name_mr": f["properties"]["WARD_TRANSLATION"]}, "geometry": json.loads(json.dumps(gs.__geo_interface__))})
def rnd(x): return [rnd(i) for i in x] if isinstance(x, (list, tuple)) else round(x, 5)
for f in feats: f["geometry"]["coordinates"] = rnd(f["geometry"]["coordinates"])
geo_json = json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":"))
# The web app and the API both import the ward polygons as a TypeScript module (no extra fetch, no runtime file reads).
(ROOT / "web" / "shared" / "wards.geo.ts").write_text(
    "// Generated by scripts/build_dataset.py from BMC's ward boundary layer. Do not edit by hand.\n"
    "import type { WardFeature } from \"./geo\";\n"
    f"const wards: {{ type: \"FeatureCollection\"; features: WardFeature[] }} = {geo_json};\nexport default wards;\n")
old_geo = WEB / "wards.geojson"
if old_geo.exists(): old_geo.unlink()

stats["unified_rows"] = len(full)
stats["rows_with_real_location"] = int(full.has_location.sum())
stats["app_rows"] = len(app)
stats["date_range_ist"] = [str(full.reported_at.min()), str(full.reported_at.max())]
stats["by_status"] = full.status.value_counts().to_dict()
stats["by_category"] = full.category.value_counts().to_dict()
stats["by_channel"] = full.channel.value_counts().to_dict()
json.dump(stats, open(ROOT / "data" / "prepare_stats.json", "w"), indent=2, default=str)
print(json.dumps(stats, indent=2, default=str))
