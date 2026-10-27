# City Problems · Mumbai

A map for Mumbai residents to see civic problems near them, check how fast BMC fixes them in their ward, and report new problems by dropping a pin on the map.

It combines about 112,000 real BMC complaints (March to October 2026) with reports filed by residents in the app. The interface uses the Firecrawl design system tokens and components (`web/src/tokens.css`).

## What residents can do

- **My Area.** Search a place, use your location, tap the map or pick one of the 26 wards. The panel shows open problems now, the ward's fix rate and median time to fix, its rank among wards and the city figure, the most reported categories, and a list of problems within 250 m, 500 m or 1 km. The map and list follow the same Open, Fixed or All filter.
- **Report a Problem.** Drag the map until the pin sits on the problem, choose a category, describe it and add a landmark. No name or phone number is asked. The report gets a tracking ID such as `CR-261027-4QMM` and appears on the public map. Other residents can add "I face this too" once per device. The app tells people that it does not file with BMC and that they should also use the MyBMC app, the BMC website or the 1916 helpline.
- **Ward Rankings.** All wards ranked by fix rate, median days to fix, open complaints or complaints per 100,000 residents, with a ward map.
- **Data Explorer.** The original query builder: group by category, ward, month, weekday, hour or channel, split into stacks, filter, and see the equivalent PostgreSQL query. Results download as CSV.

## Data

| | |
|---|---|
| Source | BMC (MCGM) public MARG ArcGIS service used by BMC's own complaint dashboards: layer 0 `COMPLAINTS_REGISTRATION` (CCRS, all departments and channels), layer 16 `POTHOLE_REGISTRATION` (Pothole QuickFix), layer 2 `Ward_Boundary` |
| Snapshot | Fetched 11 Oct 2026. Complaints dated 18 Mar to 11 Oct 2026 (IST) |
| Licence | BMC publishes no explicit open-data licence for this service. It is public and unauthenticated; this project uses it non-commercially with attribution |
| Not used | Praja Foundation reports (PDF aggregates, not per-complaint), Kaggle "BMC complaints" (synthetic), OpenCity grievance data (Bengaluru) |

`scripts/build_dataset.py` turns the raw downloads into one table with one row per complaint. `scripts/eda.py` writes the analysis in [`data/eda/EDA.md`](data/eda/EDA.md). The main decisions:

1. **One register, not two.** 12,037 of the 12,060 Pothole QuickFix rows have the same ID as a CCRS row. They are joined on ID and the pothole fields (road type, invalid flag, resolved date) are copied onto the CCRS row. Nine pothole rows are added as new rows; 10 rows without an ID are dropped.
2. **"Closed" split into Resolved and Rejected.** BMC marks 24,626 complaints CLOSED and INVALID at the same time. The old app counted them as resolved. Fix rate is now Resolved ÷ (Resolved + Rejected).
3. **Indian time.** MARG stores UTC. Dates and hours are converted to IST, which moves late-evening complaints to the correct day.
4. **Citizen-facing categories.** 14 categories from the complaint name the citizen picked, with BMC's department as a fallback, because the same complaint name is routed to different departments.
5. **Locations.** 14,546 rows (mostly from the 1916 helpline) sit on a single placeholder point, and 550 are outside Mumbai. They stay in the database with `has_location = false` and are not drawn on the map. Missing wards are filled by point-in-polygon.
6. **Time to fix.** `days_to_close` runs from the report to BMC's "after" photo, which is the best closure signal the service publishes. The app shows medians because the distribution is very skewed (median 8.4 days, mean 23.3 days).

Outputs:

| File | Use |
|---|---|
| `data/processed/problems.csv.gz` | Full unified table (112,094 rows, 20 columns). Seeds the `problems` table |
| `data/processed/wards.csv` | Ward code, name, well-known areas, zone, population |
| `web/public/data/problems.csv` | Compact copy of the 96,998 mapped rows, loaded by the browser |
| `web/shared/wards.geo.ts` | Simplified ward outlines, imported by the app and the API |
| `data/prepare_stats.json` | Row counts for every cleaning step |

To refresh the data: `python3 scripts/download_raw.py`, then `python3 scripts/build_dataset.py`, then `python3 scripts/eda.py` (needs `pandas`, `shapely`, `matplotlib`, `tabulate`).

## Database (Neon)

Schema: [`web/db/schema.sql`](web/db/schema.sql). One `problems` table holds BMC rows (`source = 'bmc'`) and resident reports (`source = 'citizen'`). `wards` holds ward names and population. `problem_supporters` records one "I face this too" vote per device.

Set up a Neon database:

```bash
cd web
cp .env.example .env.local      # paste your Neon connection string into DATABASE_URL
npm install
npm run db:setup                # creates tables, loads 26 wards and 112,094 BMC rows; safe to re-run
```

Re-running `db:setup` updates BMC rows and never touches resident reports.

The browser still reads BMC complaints from the static `problems.csv`, which a CDN serves quickly. The database stores the full dataset for SQL and holds resident reports.

## API (Vercel functions in `web/api/`)

| Route | Does |
|---|---|
| `GET /api/reports` | Resident reports, newest first (optional `?ward=KW`) |
| `POST /api/reports` | New report. Validates category, a description of at least 10 characters, and a pin inside a BMC ward. Assigns the ward on the server. Limit of 10 reports per device per day |
| `POST /api/reports/:id/support` | "I face this too", one vote per device |
| `GET /api/health` | Which database is connected |

Reporters are identified only by a salted hash of the browser's random device ID and IP address. The raw IP is never stored. All user text is rendered as text, never as HTML.

Without `DATABASE_URL`, the API returns 503 and the app saves reports in the visitor's browser only, with a notice saying so.

## Run locally

```bash
cd web
npm install
npm run dev          # http://localhost:5173. API included; uses Neon if DATABASE_URL is set, else a local PGlite database in web/.data/
npm run build        # type-checks app and API, then builds web/dist
```

## Deploy on Vercel

- Import the repo and set **Root Directory** to `web`. Framework preset: Vite.
- Add `DATABASE_URL` and `REPORTER_SALT` under Environment Variables.
- Run `npm run db:setup` once from your machine against the same database.

## Layout

```
data/raw/            raw MARG downloads
data/processed/      unified dataset and ward table
data/eda/            EDA report and charts
scripts/             download_raw.py, build_dataset.py, eda.py
web/src/             React app (views/, components/, tokens.css = Firecrawl design system)
web/api/             Vercel functions
web/db/              schema.sql, setup.mjs (schema + seed)
web/shared/          code shared by app and API: categories, ward outlines, geometry
artifacts/screenshots-v2/   screenshots of this version
```

## Limitations

- One seven-month snapshot. October 2026 is partial. Potholes and drains rise with the monsoon.
- Complaints are not the same as problems. Busy wards file more, and filing habits differ by channel.
- Rejected means BMC closed the complaint as invalid. The data does not say whether the citizen agreed.
- Reports filed in this app are not sent to BMC.
- The ward outlines are simplified. A point within 150 m of a ward edge goes to the nearest ward. On a sample of 4,850 complaints this matched BMC's own ward label 98% of the time.
- Ward locality names are a short guide for finding your ward, not official boundaries.
