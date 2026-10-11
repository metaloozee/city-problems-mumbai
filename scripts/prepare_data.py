"""Clean raw BMC MARG downloads -> compact static files for the web app.
Outputs (web/public/data/): complaints.csv, wards.geojson (simplified)
Run:  python3 scripts/prepare_data.py   (after scripts/download_raw.py)
"""
import json, pathlib, re
import pandas as pd
from shapely.geometry import shape, Point
from shapely import STRtree

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "web" / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)
BBOX = (18.85, 19.35, 72.75, 73.05)  # lat min/max, lon min/max (Greater Mumbai)
stats = {}

def category(row):
    t = str(row["type"] or "").strip(); n = str(row["name"] or "").lower()
    if "pothole" in n: return "Potholes"
    if "street light" in n: return "Street Lights"
    if t in ("Roads and traffic", "Bridges"): return "Roads & Footpaths"
    if t in ("Solid Waste Management",): return "Garbage & Sanitation"
    if t in ("Drainage", "Sewerage Operation", "Storm water drain"): return "Drainage & Sewage"
    if t == "Water supply": return "Water Supply"
    if t in ("Encroachment", "Hawkers"): return "Encroachment & Hawkers"
    if t == "Garden": return "Trees & Gardens"
    if t in ("Pest control", "Health", "Health /Hospital", "Dog Control Office", "Cattle Pound Office", "Environment"): return "Pests, Health & Environment"
    if t in ("Buildings", "Licence", "Shops & Establishment", "Factories", "Assessment", "Estate", "Colony officer", "Repairs to municipal property", "Maintenance", "School", "Security", "Education", "RETMS"): return "Buildings, Licences & Property"
    return "Other"

# --- wards
wg = json.load(open(RAW / "ward_boundary_raw.json"))
geoms = [shape(f["geometry"]) for f in wg["features"]]
codes = [f["properties"]["WARD"] for f in wg["features"]]
tree = STRtree(geoms)
def ward_of(lat, lon):
    for i in tree.query(Point(lon, lat)):
        if geoms[i].contains(Point(lon, lat)): return codes[i]
    return None

# --- general complaints layer (MyBMC MARG CCRS, layer 0)
c = pd.DataFrame(json.load(__import__("gzip").open(RAW / "complaints_raw.json.gz")))
c = pd.DataFrame({
    "id": c.COMPLAINT_ID, "type": c.COMPLAINT_TYPE.str.strip(), "name": c.COMPLAINT_NAME.str.strip().str.replace(r"\s+", " ", regex=True),
    "lat": c.COMPLAINT_REG_LATITUDE, "lon": c.COMPLAINT_REG_LONGITUDE, "ward_raw": c.COMPLAINT_REG_WARD,
    "status": c.COMPLAINT_STATUS, "created": pd.to_datetime(c.COMP_REG_DATE, unit="ms"),
    "resolved": pd.to_datetime(c.AFTER_IMAGE_DATE, unit="ms"), "zone": c.COMPLAINT_ZONE, "division": c.COMPLAINT_DIVISION,
    "source": c.COMPLAINT_SOURCE, "dataset": "CCRS"})
c["status"] = c.status.map({"CLOSED": "Closed", "IN PROGRESS": "In Progress", "IN REVIEW": "In Review", "NEW": "New", "DISCARDED": "Discarded"})
c.loc[c.status != "Closed", "resolved"] = pd.NaT   # AFTER_IMAGE_DATE only meaningful for closed complaints
# --- pothole layer (Pothole QuickFix, layer 16)
p = pd.DataFrame(json.load(open(RAW / "potholes_raw.json")))
pst = p.STATUS.map({"Resolved": "Closed", "In Progress": "In Progress", "In Review": "In Review"})
pst[p.SUBSTATUS == "Invalid"] = "Discarded"
p = pd.DataFrame({
    "id": p.COMPLAINTS_ID, "type": "Roads and traffic", "name": "Pothole (QuickFix)", "lat": p.LATITUDE, "lon": p.LONGITUDE,
    "ward_raw": p.WARD_NAME, "status": pst, "created": pd.to_datetime(p.COMPLAINTS_CREATION_DATE, unit="ms"),
    "resolved": pd.to_datetime(p.RESOLVED_DATE, unit="ms"), "zone": p.ZONE, "division": p.DIVISION, "source": p.COMPLAINT_SOURCE,
    "dataset": "PotholeQuickFix"})
p.loc[p.status != "Closed", "resolved"] = pd.NaT
df = pd.concat([c, p], ignore_index=True)
stats["rows_downloaded"] = {"ccrs": len(c), "pothole_quickfix": len(p), "total": len(df)}

df = df.drop_duplicates("id")
df = df[df.status.notna()]
ok = df.lat.between(BBOX[0], BBOX[1]) & df.lon.between(BBOX[2], BBOX[3])
stats["dropped_bad_or_missing_coordinates"] = int((~ok).sum())
df = df[ok].copy()
# The 1916 helpline channel (and some app rows) stamp a PLACEHOLDER coordinate on complaints that have no real location.
# One exact point holds >14k rows (vs <140 for any other point), so it is not a real place -> drop, never map.
PLACEHOLDER = (19.07766, 72.87741)
ph = (df.lat.round(5) == PLACEHOLDER[0]) & (df.lon.round(5) == PLACEHOLDER[1])
stats["dropped_placeholder_coordinate"] = int(ph.sum())
stats["placeholder_coordinate"] = list(PLACEHOLDER)
df = df[~ph].copy()
# ward: use official ward code when valid, else derive from point-in-polygon
valid = set(codes)
df["ward"] = df.ward_raw.where(df.ward_raw.isin(valid))
miss = df.ward.isna()
stats["ward_derived_by_point_in_polygon"] = int(miss.sum())
df.loc[miss, "ward"] = [ward_of(a, b) for a, b in zip(df.lat[miss], df.lon[miss])]
stats["dropped_no_ward"] = int(df.ward.isna().sum())
df = df[df.ward.notna()]
df["category"] = df.apply(category, axis=1)
df["res_days"] = ((df.resolved - df.created).dt.total_seconds() / 86400).round(2)
df.loc[(df.res_days < 0) | (df.res_days > 400), "res_days"] = pd.NA   # guard against bad timestamps
df["date"] = df.created.dt.strftime("%Y-%m-%d")
df["lat"] = df.lat.round(5); df["lon"] = df.lon.round(5)
out = df[["id", "date", "category", "name", "ward", "zone", "status", "lat", "lon", "res_days", "source", "dataset"]]
out = out.rename(columns={"name": "subcategory"})
out.to_csv(OUT / "complaints.csv", index=False)
stats["rows_shipped"] = len(out)
stats["date_range"] = [out.date.min(), out.date.max()]
stats["by_category"] = out.category.value_counts().to_dict()
stats["by_status"] = out.status.value_counts().to_dict()
stats["res_days_available"] = int(out.res_days.notna().sum())

# --- ward geojson (simplified, with population)
feats = []
for f, g in zip(wg["features"], geoms):
    gs = g.simplify(0.0004, preserve_topology=True)
    feats.append({"type": "Feature", "properties": {"ward": f["properties"]["WARD"], "population": f["properties"]["SUM_POPULA"],
                  "name_mr": f["properties"]["WARD_TRANSLATION"]},
                  "geometry": json.loads(json.dumps(gs.__geo_interface__))})
def rnd(x):
    return [rnd(i) for i in x] if isinstance(x, (list, tuple)) else round(x, 5)
for f in feats: f["geometry"]["coordinates"] = rnd(f["geometry"]["coordinates"])
(OUT / "wards.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")))
json.dump(stats, open(ROOT / "data" / "prepare_stats.json", "w"), indent=2)
print(json.dumps(stats, indent=2))
