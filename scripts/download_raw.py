"""Download raw public data from BMC's MARG ArcGIS REST service (no auth needed).
Personal-data fields (contact numbers, free-text descriptions, officer names) are NOT requested."""
import gzip, json, urllib.request, urllib.parse, pathlib, time
B = "https://marg.mcgm.gov.in/server/rest/services/MARG_APP/MARG_Application_Prod/MapServer"
RAW = pathlib.Path(__file__).resolve().parent.parent / "data" / "raw"
def q(layer, **p):
    p.setdefault("f", "json")
    url = f"{B}/{layer}/query?" + urllib.parse.urlencode(p)
    for i in range(4):
        try:
            return json.load(urllib.request.urlopen(url, timeout=120))
        except Exception as e:
            print("retry", e); time.sleep(3)
    raise SystemExit("failed")
def paged(layer, fields, out):
    rows, off = [], 0
    n = q(layer, where="1=1", returnCountOnly="true")["count"]
    print(layer, "count", n)
    while off < n:
        d = q(layer, where="1=1", outFields=fields, returnGeometry="false", orderByFields="OBJECTID",
              resultOffset=off, resultRecordCount=2000)
        fs = d["features"]
        if not fs: break
        rows += [f["attributes"] for f in fs]; off += len(fs); print(off, end=" ", flush=True)
    if out.endswith(".gz"):
        with gzip.open(RAW / out, "wt") as fh: json.dump(rows, fh)
    else:
        (RAW / out).write_text(json.dumps(rows))
paged(0, "OBJECTID,COMPLAINT_ID,COMPLAINT_SOURCE,COMPLAINT_TYPE,COMPLAINT_NAME,COMPLAINT_REG_LATITUDE,COMPLAINT_REG_LONGITUDE,COMPLAINT_REG_WARD,COMPLAINT_STATUS,COMP_REG_DATE,ESCALATED_NEW,REOPEN,AFTER_IMAGE_DATE,COMPLAINT_DIVISION,COMPLAINT_ZONE,INVALID,ATTENDED,CURRENT_ESC_LVL", "complaints_raw.json.gz")
paged(16, "OBJECTID,COMPLAINT_TYPE,COMPLAINTS_CREATION_DATE,LATITUDE,LONGITUDE,WARD_NAME,COMPLAINT_SOURCE,COMPLAINTS_ID,STATUS,RESOLVED_DATE,ROAD_TYPE,DIVISION,ZONE,SUBSTATUS,ESCALATED,RESOLUTION_HRS,REOPEN_STATUS", "potholes_raw.json")
for layer, name in [(2, "ward_boundary_raw.json")]:
    d = q(layer, where="1=1", outFields="WARD,SUM_POPULA,ABBREVIATION,WARD_TRANSLATION", outSR=4326, returnGeometry="true", f="geojson")
    (RAW / name).write_text(json.dumps(d))
