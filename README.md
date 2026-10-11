# City Problems · Mumbai

Interactive map + query workbench for **real Mumbai (BMC) civic complaints** – potholes, garbage, drainage & sewage,
water supply, street lights, encroachment, trees, pests and more. Built for a Big Data Analysis (BDA) mini-project.

* Vite + React + TypeScript, Leaflet / react-leaflet (OpenStreetMap tiles – no API key), supercluster, leaflet.heat, Recharts
* 100 % static: data is served as files from `web/public/data/`, all queries run in the browser → deploys to Vercel with no backend or secrets.

## Features
* **Map** – three modes: clustered markers (click a pin for details), heatmap, and ward choropleth (colour by count, complaints per 100k residents, avg resolution days, % resolved, or the *current query result*). Click a ward to filter by it.
* **Filters** – category, status, ward, date range, "resolution delay ≥ N days" (severity proxy, closed complaints only), complaint-type text search.
* **Summary cards** – total, % resolved, still open, avg days to close, busiest ward, top category.
* **Query builder** – *group by* (category, sub-category, ward, zone, month, weekday, status, filing channel) × optional *split by* (stacked) × *metric* (count, avg resolution days, % resolved, complaints per 100k residents [ward only]) with Top-N, min-complaints-per-group (HAVING), ordering and a hotspot rule. Result is a chart + table, with the **equivalent SQL** printed above it. "Highlight on map" paints the ward result on the choropleth.
* **Export** – filtered complaints CSV and query-result CSV.

### Preset queries
1. Top 10 wards by potholes
2. Monthly trend of potholes
3. Slowest-resolved categories (avg resolution days, ≥100 complaints)
4. Hotspot wards (complaints per 100k residents ≥ mean + 0.5σ)
5. Category mix per ward (stacked)
6. Wards with lowest % resolved (≥200 complaints)
7. Garbage complaints by weekday
8. Water-supply complaints per 100k residents

## Data
| | |
|---|---|
| Publisher | Brihanmumbai Municipal Corporation (BMC / MCGM) – public **MARG** ArcGIS REST service used by BMC's own public Pothole QuickFix dashboard (`https://marg.mcgm.gov.in/BMC_C_Pothole_Dashboard/`) |
| Endpoint | `https://marg.mcgm.gov.in/server/rest/services/MARG_APP/MARG_Application_Prod/MapServer` – layers **0** `COMPLAINTS_REGISTRATION` (112,086 rows), **16** `POTHOLE_REGISTRATION` (12,060 rows), **2** `Ward_Boundary` (26 wards, with a population field) |
| Fetched | 11 Oct 2026 (complaints dated 2026-03-18 → 2026-10-11) |
| Licence | BMC states **no explicit open-data licence** on this service. It is public, unauthenticated government data; this repo uses it for non-commercial academic purposes with attribution to BMC/MCGM. Check with BMC before any commercial reuse. |
| Coordinates | **Real** per-complaint latitude/longitude from the citizen's app/GPS – nothing is geocoded or invented. Ward boundaries are used only to (a) fill the 58 rows with an unknown ward by point-in-polygon and (b) draw the choropleth. |

Why not Kaggle / OpenCity / data.gov.in? The Kaggle "1.2M Complaints BMC" set is documented as *synthetic*; OpenCity's grievance data is Bengaluru (BBMP); BMC has no downloadable Mumbai complaint CSV on data.gov.in. The MARG service is the only real, geo-tagged, per-complaint Mumbai source we found.

### Cleaning (`scripts/prepare_data.py`)
1. Only non-personal fields are downloaded (no phone numbers, free-text descriptions, officer names, contractor names, photos).
2. Layer 0 + layer 16 are unified into one schema (`id, date, category, subcategory, ward, zone, status, lat, lon, res_days, source, dataset`). Pothole QuickFix rows flagged "Invalid" become status *Discarded*.
3. Rows with missing / projected / out-of-Mumbai coordinates are dropped (**550**).
4. **14,546 rows were dropped because they all sit on one placeholder point** (19.07766, 72.87741 – mostly the "1916" helpline channel and invalid potholes with no real location; the next busiest point has only 132). Keeping them would have made ward L look falsely huge. This also means almost all *Discarded/invalid* complaints are absent from the map data.
5. 58 rows with unknown ward get one by point-in-polygon on the BMC ward boundaries.
6. `category` is derived from BMC's own complaint type/name (e.g. "Bad patches/potholes on roads" → *Potholes*, "street light" → *Street Lights*, drainage/sewerage/storm-water → *Drainage & Sewage*). Mapping is in `category()`.
7. `res_days` = days from complaint date to the date of the *after/attended image* for **Closed** complaints (BMC does not publish a true closure timestamp for layer 0; for potholes layer 16 uses `RESOLVED_DATE`). Negative or >400-day values are blanked.
8. Result: **96,999 rows, ~13 MB** CSV (`web/public/data/complaints.csv`) + simplified ward GeoJSON (31 KB). Summary in `data/prepare_stats.json`.

### Limitations
* One ~7-month snapshot (Mar–Oct 2026), not a multi-year history; October 2026 is a partial month. Pothole counts rise with the monsoon.
* Complaints ≠ problems: busier wards file more, and filing behaviour/channel differs. Per-100k rates use ward population from the BMC boundary layer.
* "Severity" is not published; the delay filter is a proxy.
* Status values are BMC's at fetch time; the live service keeps changing.

## Run locally
```bash
cd web
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build into web/dist
npm run preview
```
Re-create the data (optional; needs Python 3 with `pandas` and `shapely`):
```bash
python3 scripts/download_raw.py     # ~2 min, writes data/raw/*
python3 scripts/prepare_data.py     # writes web/public/data/*
```

## Deploy on Vercel (later)
* Import the repo, set **Root Directory** = `web`
* Framework preset **Vite**, Build command `npm run build`, Output directory `dist`
* No environment variables, no backend.

## Layout
```
data/raw/            raw API downloads (complaints gzipped) + prepare_stats.json
scripts/             download_raw.py, prepare_data.py
web/                 Vite + React + TS app (public/data = shipped dataset)
artifacts/screenshots/
```
