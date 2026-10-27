#!/usr/bin/env python3
"""Build the updated BDA Mini Project report (City Problems, citizen app version).

  python3 scripts-report/build_report_v2.py          # writes report/City_Problems_Report.docx and .pdf

Figures:
  report/diagrams/*.png     drawn with tldraw (scratch renderer described in report/diagrams/README.md)
  report/figures-v2/*.png   screenshots of the running app
  data/eda/*.png            EDA charts from scripts/eda.py
The table of contents is filled in a second pass from the page numbers LibreOffice produces.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
import textwrap
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "report"
OUT = REPORT / "City_Problems_Report.docx"
FONT, MONO = "Liberation Serif", "Liberation Mono"
TITLE = "City Problems - Mumbai Civic Issues Map"
NAMES = ["Ayan Parkar (63)", "Sourabh Patel (64)", "Mohammed Owaiz Shaikh (65)"]
TOC = ["1. Introduction", "2. System Architecture", "3. Implementation", "Technologies Used", "4. Results", "5. Conclusion", "6. References"]


# ---------------------------------------------------------------- references (IEEE)
# Numbered in order of first citation in the text, as IEEE requires. *text* is set in italics.
WEB, DATA = "Accessed: Oct. 27, 2026", "Accessed: Oct. 11, 2026"
REFS = {
    "guide": "Dept. Comput. Eng., Shree L. R. Tiwari Coll. Eng., Mira Road, Thane, India, “BDA mini project guidelines,” unpublished.",
    "marg": f"Brihanmumbai Municipal Corporation, “MARG_Application_Prod (MapServer): layers 0 COMPLAINTS_REGISTRATION, 16 POTHOLE_REGISTRATION and 2 Ward_Boundary,” MARG ArcGIS REST Services Directory, 2026. {DATA}. [Online]. Available: https://marg.mcgm.gov.in/server/rest/services/MARG_APP/MARG_Application_Prod/MapServer",
    "dash": f"Brihanmumbai Municipal Corporation, “Pothole QuickFix dashboard,” BMC MARG. {DATA}. [Online]. Available: https://marg.mcgm.gov.in/BMC_C_Pothole_Dashboard/",
    "praja": "Praja Foundation, “Report on the status of civic services, environmental and climate issues in Mumbai 2026,” Praja Found., Mumbai, India, 2026. [Online]. Available: https://praja.org/praja_docs/praja_downloads/Report%20on%20the%20Status%20of%20Civic%20Services,%20Environmental%20and%20Climate%20Issues%20in%20Mumbai%202026.pdf",
    "pandas": "W. McKinney, “Data structures for statistical computing in Python,” in *Proc. 9th Python Sci. Conf. (SciPy)*, Austin, TX, USA, 2010, pp. 56–61, doi: 10.25080/Majora-92bf1922-00a.",
    "shapely": f"S. Gillies et al., *Shapely*. (Version 2.2.0). {WEB}. [Online]. Available: https://shapely.readthedocs.io/",
    "mpl": "J. D. Hunter, “Matplotlib: A 2D graphics environment,” *Comput. Sci. Eng.*, vol. 9, no. 3, pp. 90–95, May/Jun. 2007, doi: 10.1109/MCSE.2007.55.",
    "react": f"Meta Open Source, *React*. (Version 19.3.1). {WEB}. [Online]. Available: https://react.dev/",
    "vite": f"Vite Team, *Vite*. (Version 8.3.5). {WEB}. [Online]. Available: https://vite.dev/",
    "vercel": f"Vercel Inc., “Vercel Functions,” Vercel Documentation. {WEB}. [Online]. Available: https://vercel.com/docs/functions",
    "neon": f"Neon, “Neon serverless driver,” Neon Documentation. {WEB}. [Online]. Available: https://neon.com/docs/serverless/serverless-driver",
    "pglite": f"ElectricSQL, *PGlite*. (Version 0.5.12). {WEB}. [Online]. Available: https://pglite.dev/",
    "nominatim": f"OpenStreetMap Foundation, “Search,” Nominatim Documentation. {WEB}. [Online]. Available: https://nominatim.org/release-docs/latest/api/Search/",
    "maplibre": f"MapLibre Organization, *MapLibre GL JS*. (Version 6.16.0). {WEB}. [Online]. Available: https://maplibre.org/",
    "mapcn": f"“mapcn: Map components for shadcn/ui,” mapcn. {WEB}. [Online]. Available: https://mapcn.dev/",
    "papa": f"M. Holt, *Papa Parse*. (Version 5.7.0). {WEB}. [Online]. Available: https://www.papaparse.com/",
    "tailwind": f"Tailwind Labs, *Tailwind CSS*. (Version 4.3.3). {WEB}. [Online]. Available: https://tailwindcss.com/",
    "shadcn": f"shadcn, *shadcn/ui*. (2026). {WEB}. [Online]. Available: https://ui.shadcn.com/",
    "carto": f"CARTO, “Basemaps,” CARTO. {WEB}. [Online]. Available: https://carto.com/basemaps",
    "osm": f"OpenStreetMap contributors, “Copyright and license,” OpenStreetMap. {WEB}. [Online]. Available: https://www.openstreetmap.org/copyright",
    "recharts": f"Recharts Group, *Recharts*. (Version 3.10.1). {WEB}. [Online]. Available: https://recharts.org/",
    "tldraw": f"tldraw Inc., *tldraw*. (Version 3.15.6). {WEB}. [Online]. Available: https://tldraw.dev/",
}
CITED: dict[str, int] = {}


def cite(text):
    """Replace {{key}} or {{k1,k2}} with IEEE numbers [1] or [1], [2], numbering by first appearance."""
    def num(m):
        out = []
        for k in m.group(1).split(","):
            if k not in REFS:
                raise KeyError(f"unknown reference {k}")
            CITED.setdefault(k, len(CITED) + 1)
            out.append(f"[{CITED[k]}]")
        return ", ".join(out)
    return re.sub(r"\{\{([\w,]+)\}\}", num, text)


# ---------------------------------------------------------------- helpers
def run_font(run, size=12, bold=False, italic=False, font=FONT, color=(0, 0, 0)):
    run.bold, run.italic = bold, italic
    run.font.name, run.font.size = font, Pt(size)
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), font)
    run.font.color.rgb = RGBColor(*color)


def para(doc, text="", *, size=12, bold=False, italic=False, align="left", before=0, after=6, spacing=1.15, page_break=False, keep_next=False):
    p = doc.add_paragraph()
    p.alignment = {"center": WD_ALIGN_PARAGRAPH.CENTER, "right": WD_ALIGN_PARAGRAPH.RIGHT, "justify": WD_ALIGN_PARAGRAPH.JUSTIFY}.get(align, WD_ALIGN_PARAGRAPH.LEFT)
    f = p.paragraph_format
    f.space_before, f.space_after, f.line_spacing = Pt(before), Pt(after), spacing
    f.page_break_before, f.keep_with_next = page_break, keep_next
    if text:
        run_font(p.add_run(cite(text)), size, bold, italic)
    return p


def body(doc, text):
    return para(doc, text, align="justify", after=8, spacing=1.4)


def rich(doc, parts, *, after=6, spacing=1.35, indent=0):
    p = para(doc, align="justify", after=after, spacing=spacing)
    if indent:
        p.paragraph_format.left_indent = Cm(indent)
    for text, bold in parts:
        run_font(p.add_run(cite(text)), 12, bold)
    return p


def bullet(doc, label, text=""):
    return rich(doc, [("•  " + label + (": " if text else ""), bool(text)), (text, False)] if text else [("•  " + label, False)])


def chapter(doc, text):
    return para(doc, text, size=16, bold=True, align="center", after=14, page_break=True)


def sub(doc, text):
    return para(doc, text, bold=True, before=8, after=4, keep_next=True)


def shade(cell, hex_fill):
    tcPr = cell._element.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear"); shd.set(qn("w:color"), "auto"); shd.set(qn("w:fill"), hex_fill)
    tcPr.append(shd)


def no_borders(table):
    tblPr = table._element.tblPr
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        e = OxmlElement(f"w:{edge}"); e.set(qn("w:val"), "nil"); borders.append(e)
    tblPr.append(borders)


def code(doc, text, size=7.8):
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    no_borders(t)
    cell = t.rows[0].cells[0]
    shade(cell, "F3F3F3")
    cell.width = Inches(6.3)
    cell.paragraphs[0].text = ""
    lines = []
    for line in text.strip("\n").splitlines():
        indent = len(line) - len(line.lstrip())
        lines += textwrap.wrap(line, 92, subsequent_indent=" " * (indent + 4), break_on_hyphens=False, drop_whitespace=True) or [""]
    for i, line in enumerate(lines):
        p = cell.paragraphs[0] if i == 0 else cell.add_paragraph()
        f = p.paragraph_format
        f.space_before = Pt(4) if i == 0 else Pt(0)
        f.space_after, f.line_spacing = Pt(0), 1.0
        f.left_indent = Cm(0.2)
        run_font(p.add_run(line or " "), size, font=MONO)
    cell.paragraphs[-1].paragraph_format.space_after = Pt(4)
    para(doc, after=4)


def figure(doc, path, caption, width=6.2):
    p = para(doc, align="center", before=6, after=2, keep_next=True)
    p.add_run().add_picture(str(path), width=Inches(width))
    para(doc, caption, size=10, italic=True, align="center", after=10)


def table(doc, header, rows, widths):
    t = doc.add_table(rows=1, cols=len(header))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(header):
        c = t.rows[0].cells[i]; c.text = ""; shade(c, "EDEDED")
        run_font(c.paragraphs[0].add_run(h), 10.5, bold=True)
    for r in rows:
        cells = t.add_row().cells
        for i, v in enumerate(r):
            cells[i].text = ""
            run_font(cells[i].paragraphs[0].add_run(str(v)), 10.5)
            if i > 0 and re.fullmatch(r"[\d,.%]+( days)?", str(v)):
                cells[i].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
    for row in t.rows:
        for i, w in enumerate(widths):
            row.cells[i].width = Inches(w)
    para(doc, after=6)


def page_field(paragraph):
    run = paragraph.add_run()
    for kind, text in (("begin", None), (None, "PAGE"), ("end", None)):
        if kind:
            el = OxmlElement("w:fldChar"); el.set(qn("w:fldCharType"), kind); run._r.append(el)
        else:
            el = OxmlElement("w:instrText"); el.set(qn("xml:space"), "preserve"); el.text = text; run._r.append(el)
    run_font(run, 10)


def header_footer(section):
    section.different_first_page_header_footer = True
    hp = section.header.paragraphs[0]
    hp.text = ""
    for pos in (3.25, 6.5):  # the default Header style's centre and right stops
        hp.paragraph_format.tab_stops.add_tab_stop(Inches(pos), alignment=WD_TAB_ALIGNMENT.CLEAR)
    hp.paragraph_format.tab_stops.add_tab_stop(Inches(6.27), alignment=WD_TAB_ALIGNMENT.RIGHT)
    run_font(hp.add_run("Department of Computer Engineering\tBDA Mini Project"), 9, color=(90, 90, 90))
    pPr = hp._p.get_or_add_pPr()
    bdr = OxmlElement("w:pBdr"); bottom = OxmlElement("w:bottom")
    for k, v in (("w:val", "single"), ("w:sz", "4"), ("w:space", "4"), ("w:color", "BBBBBB")):
        bottom.set(qn(k), v)
    bdr.append(bottom); pPr.append(bdr)
    fp = section.footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    page_field(fp)


# ---------------------------------------------------------------- content
def build(toc_pages):
    CITED.clear()
    doc = Document()
    s = doc.sections[0]
    s.page_width, s.page_height = Cm(21.0), Cm(29.7)
    s.top_margin = s.bottom_margin = s.left_margin = s.right_margin = Inches(1.0)
    header_footer(s)

    # Cover (unchanged from the submitted report)
    para(doc, after=40)
    para(doc, "BDA MINI PROJECT REPORT", size=14, bold=True, align="center", after=22)
    para(doc, "City Problems", size=22, bold=True, align="center", after=6)
    para(doc, "Mumbai Civic Issues Map", size=16, bold=True, align="center", after=26)
    for line in ("Submitted in partial fulfilment of the requirements", "for the Semester VII BDA Mini Project", "Bachelor of Engineering in Computer Engineering"):
        para(doc, line, align="center", after=0)
    para(doc, "Submitted by", align="center", before=22, after=10)
    for n in NAMES:
        para(doc, n, bold=True, align="center", after=4)
    para(doc, "Under the guidance of", align="center", before=18, after=2)
    para(doc, "Prof. Puja Sarage", bold=True, align="center", after=14)
    logo = para(doc, align="center", after=14)
    logo.add_run().add_picture(str(REPORT / "figures" / "college-logo.png"), width=Inches(1.4))
    para(doc, "Department of Computer Engineering", size=13, bold=True, align="center", after=4)
    para(doc, "Shree L. R. Tiwari College of Engineering", size=14, bold=True, align="center", after=4)
    para(doc, "Kanakia Park, Mira Road (E), Thane - 401 107, Maharashtra", size=11, align="center", after=18)
    para(doc, "Academic Year 2026-2027", bold=True, align="center")

    # Approval (unchanged)
    chapter(doc, "BDA Mini Project Report Approval")
    rich(doc, [("This project report entitled ", False), ("“City Problems - Mumbai Civic Issues Map”", True), (", submitted by ", False),
               ("Mr. Ayan Parkar (63), Mr. Sourabh Patel (64)", True), (" and ", False), ("Mr. Mohammed Owaiz Shaikh (65)", True),
               (", is approved towards fulfilment of the Semester VII BDA Mini Project requirements for the Bachelor of Engineering in "
                "Computer Engineering at Shree L. R. Tiwari College of Engineering for the academic year 2026-2027.", False)], spacing=1.4)
    para(doc, after=150)
    para(doc, "______________________________", align="right", after=4)
    para(doc, "Internal Examiner", bold=True, align="right")

    # Declaration (unchanged)
    chapter(doc, "Declaration")
    for t in ("We declare that this submission represents our original work. Wherever the ideas, words, data or other material of others have been used, the original sources have been appropriately cited and acknowledged.",
              "We have adhered to the principles of academic honesty and integrity and have not knowingly misrepresented, fabricated or falsified any idea, data, fact or source in this report.",
              "We understand that any violation of these principles may result in disciplinary action by the Institute and, where applicable, action by the original rights holders for material used without appropriate acknowledgement or permission."):
        body(doc, t)
    for n in ("Mr. Ayan Parkar (63)", "Mr. Sourabh Patel (64)", "Mr. Mohammed Owaiz Shaikh (65)"):
        para(doc, "____________________________________", before=26, after=6)
        para(doc, f"Signature - {n}", after=4)
    para(doc, "Date: ____________________", before=26, after=2)
    para(doc, "Place: ___________________")

    # Table of contents
    chapter(doc, "Table of Contents")
    t = doc.add_table(rows=1, cols=2)
    no_borders(t)
    run_font(t.rows[0].cells[0].paragraphs[0].add_run("SECTION"), 11, bold=True)
    hdr = t.rows[0].cells[1].paragraphs[0]; hdr.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run_font(hdr.add_run("PAGE"), 11, bold=True)
    for name in TOC:
        cells = t.add_row().cells
        for c in cells:
            c.paragraphs[0].paragraph_format.space_before = Pt(10); c.paragraphs[0].paragraph_format.space_after = Pt(10)
        run_font(cells[0].paragraphs[0].add_run(name), 12)
        pp = cells[1].paragraphs[0]; pp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        run_font(pp.add_run(str(toc_pages.get(name, ""))), 12)
    for row in t.rows:
        row.cells[0].width, row.cells[1].width = Inches(5.3), Inches(1.0)

    D, S, E = REPORT / "diagrams", REPORT / "figures-v2", ROOT / "data" / "eda"

    # 1. Introduction
    chapter(doc, "1. Introduction")
    body(doc, "Mumbai’s civic body, the Brihanmumbai Municipal Corporation (BMC), receives tens of thousands of citizen complaints every few "
              "months: potholes, uncollected garbage, blocked drains, water-supply faults, broken street lights, encroachment and more. "
              "Each complaint is a small record, but together they form a large, geo-tagged, time-stamped dataset that shows where the city "
              "is failing, how fast problems are fixed, and how complaint patterns change with seasons such as the monsoon.")
    body(doc, "City Problems is a Big Data Analysis (BDA) mini-project that turns this public data into a map-based application for the "
              "people who pay for these services: Mumbai’s residents and taxpayers. A resident picks an area by searching, using their "
              "location, tapping the map or choosing a ward. The app then shows open problems nearby, how quickly BMC fixes problems in that "
              "ward compared with the rest of the city, and what neighbours have reported. Residents can report a new problem by placing a pin "
              "on the map. An analyst view, the Data Explorer, keeps the group-by and aggregation workbench of the first version and shows the "
              "equivalent PostgreSQL query for every result. The project follows the department’s BDA mini-project guidelines {{guide}}.")
    sub(doc, "1.1 Big data perspective")
    bullet(doc, "Volume", "124,146 raw records were downloaded (112,086 general complaints and 12,060 pothole records). After joining and "
                          "cleaning they form one table of 112,094 complaints, of which 96,998 have a real map location.")
    bullet(doc, "Variety", "Structured complaint rows (category, ward, status, timestamps, filing channel), geospatial points, ward polygons "
                           "with population, and free-text reports written by residents.")
    bullet(doc, "Velocity", "The BMC MARG service keeps receiving complaints and changing statuses, and residents add reports in real time "
                            "through the app. The snapshot used here was fetched on 11 Oct 2026; the pipeline can be re-run to refresh it.")
    bullet(doc, "Veracity", "The raw data has placeholder coordinates, complaints closed as invalid, UTC timestamps and inconsistent "
                            "department routing. The cleaning pipeline (Section 2.2) corrects each of these before analysis.")
    sub(doc, "1.2 Objectives")
    for t in ("Acquire a real, geo-tagged Mumbai civic-complaint dataset from a public source.",
              "Clean and integrate multiple layers into one uniform dataset and document the decisions with exploratory data analysis.",
              "Give residents a meaningful view of their own area: open problems, fix rate and time to fix, compared with the city.",
              "Let residents report a problem by selecting its location on the map, and store reports in a PostgreSQL database (Neon).",
              "Keep an analyst workbench with flexible group-by queries, eight preset questions and the equivalent SQL."):
        bullet(doc, t)

    # 2. System Architecture
    chapter(doc, "2. System Architecture")
    sub(doc, "2.1 Data source")
    body(doc, "The data comes from the public MARG ArcGIS REST service of BMC {{marg}}, the same service used by BMC’s own Pothole QuickFix "
              "dashboard {{dash}}. Three layers are used:")
    bullet(doc, "Layer 0 COMPLAINTS_REGISTRATION", "112,086 complaints from every department and every filing channel, each with its own latitude and longitude.")
    bullet(doc, "Layer 16 POTHOLE_REGISTRATION", "12,060 pothole records from Pothole QuickFix, with road type and an invalid flag.")
    bullet(doc, "Layer 2 Ward_Boundary", "26 ward polygons with a population field.")
    body(doc, "Licence note: BMC states no explicit open-data licence on this service. It is public, unauthenticated government data and is "
              "used here only for non-commercial academic purposes with attribution to BMC/MCGM. Only non-personal fields were downloaded "
              "(no phone numbers, free-text descriptions, officer or contractor names, or photos). Other candidate datasets were reviewed and "
              "not used: the Kaggle “1.2M Complaints BMC” set is documented as synthetic, Praja Foundation’s 2026 civic report {{praja}} "
              "publishes city-level totals in PDF form rather than individual complaints, and OpenCity’s grievance data covers Bengaluru.")
    sub(doc, "2.2 Data pipeline (scripts/download_raw.py, scripts/build_dataset.py, scripts/eda.py)")
    body(doc, "The pipeline is written in Python with pandas {{pandas}} and Shapely {{shapely}}; the EDA charts use Matplotlib {{mpl}}. Figure 1 shows the pipeline. The main decisions, each backed by the exploratory analysis in data/eda/EDA.md, are:")
    steps = [
        ("One register, not two", "12,037 of the 12,060 pothole records carry the same complaint ID as a layer 0 complaint, so the layers are two views of one register. They are joined on ID and the pothole fields are copied onto the layer 0 row. 9 pothole-only records are added and 10 without an ID are dropped. The first version stacked both layers and de-duplicated, which silently discarded the pothole fields."),
        ("Closed is not the same as fixed", "BMC marks 24,626 complaints as CLOSED while also flagging them INVALID. The first version counted them as resolved. The unified status separates Resolved (52,261) from Rejected (24,626), and the fix rate is Resolved ÷ (Resolved + Rejected)."),
        ("Indian time", "MARG stores UTC epoch milliseconds. All timestamps are converted to IST, which moves late-evening complaints to the correct day; the busiest hour becomes 11:00 IST instead of 05:00 UTC."),
        ("Time to fix", "days_to_close runs from the report to the date of BMC’s “after” photo (the resolved date for potholes). Values below 0 or above 400 days are blanked."),
        ("Locations", "14,546 complaints, mostly from the 1916 helpline, sit on one placeholder point (19.07766, 72.87741) and 550 lie outside Greater Mumbai. They stay in the table with has_location = false so city totals remain complete, but they are not drawn on the map."),
        ("Wards", "58 complaints with a missing ward are assigned one by point-in-polygon on the BMC ward boundaries (Shapely STRtree)."),
        ("Citizen-facing categories", "Categories come from the complaint name the citizen picked, with BMC’s department as a fallback, because the same complaint name is often routed to different departments. The result is 14 categories such as Potholes, Drains & Sewage and Illegal Construction."),
    ]
    for i, (k, v) in enumerate(steps, 1):
        rich(doc, [(f"{i}. {k}: ", True), (v, False)])
    figure(doc, D / "pipeline.png", "Fig. 1: Data pipeline from the three MARG layers to the unified dataset and its outputs", width=5.2)
    body(doc, "Outputs: data/processed/problems.csv.gz (112,094 rows, 20 columns, the database seed), web/public/data/problems.csv "
              "(the 96,998 mapped rows in compact form, loaded by the browser), the simplified ward outlines in web/shared/wards.geo.ts, "
              "data/processed/wards.csv and data/prepare_stats.json with the row counts for every step.")

    sub(doc, "2.3 Application architecture")
    body(doc, "The web application is a React {{react}} single-page app built with Vite {{vite}} and deployed on Vercel {{vercel}} with web/ as the project root (Figure 2). "
              "BMC complaints are served as a static CSV from the CDN and analysed in the browser, which keeps the map fast without a "
              "database round trip. Resident reports go through Vercel functions in web/api/ to a Neon PostgreSQL database {{neon}}, which also holds "
              "the full unified dataset for SQL analysis. During local development the same functions run inside the Vite dev server against "
              "an embedded PGlite database {{pglite}}, and without a database the app saves reports on the visitor’s device and says so.")
    figure(doc, D / "architecture.png", "Fig. 2: System architecture: offline pipeline, storage, Vercel deployment and external map services")

    sub(doc, "2.4 Database design")
    body(doc, "One problems table holds both BMC complaints (source = 'bmc') and resident reports (source = 'citizen'), so every query and "
              "ranking can include either. The wards table holds names, well-known areas and population for per-capita rates. "
              "problem_supporters records one “I face this too” vote per device. is_open is a generated column, and a check constraint "
              "ties has_location to the presence of coordinates (Figure 3).")
    figure(doc, D / "schema.png", "Fig. 3: Database schema in Neon PostgreSQL (web/db/schema.sql)")

    sub(doc, "2.5 Main modules")
    for k, v in [
        ("views/AreaView.tsx", "My Area: place search through Nominatim {{nominatim}}, location, ward picker, ward statistics with rank and city comparison, and the list of problems within 250 m, 500 m or 1 km."),
        ("views/ReportView.tsx", "Report a Problem: centre-pin placement, category, description and landmark, validation messages and the tracking ID."),
        ("views/OverviewView.tsx", "Ward Rankings: all wards ranked and mapped by fix rate, median days to fix, open complaints or complaints per 100,000 residents."),
        ("views/ExplorerView.tsx, query.ts", "Data Explorer: filters, group by, split by, measure, Top-N, minimum group size, hotspot rule, chart, table, CSV export and the equivalent SQL."),
        ("components/MapView.tsx", "MapLibre GL map {{maplibre}} (mapcn component {{mapcn}}) with GPU clustering of complaints, resident-report markers, ward outlines and the choropleth."),
        ("api/reports, api/_lib", "Vercel functions: list, create and support resident reports; validation, rate limit and server-side ward assignment."),
        ("shared/", "Code used by both the app and the API: categories, ward outlines and point-in-polygon geometry."),
    ]:
        bullet(doc, k, v)

    # 3. Implementation
    chapter(doc, "3. Implementation")
    sub(doc, "3.1 Categorisation in the cleaning pipeline")
    code(doc, '''CATEGORY_RULES = [  # (category, regex on complaint name) - first match wins
    ("Potholes", r"pothole"),
    ("Street Lights", r"street light|electric supply"),
    ("Encroachment & Hawkers", r"hawk|encro|banner|advertisement"),
    ("Drains & Sewage", r"drain|manhole|nullah|nalla|sewer|sewage|septic|swd"),
    ("Water Supply", r"water (supply|line|connection|bill|meter)|contaminated water"),
    ("Garbage & Cleanliness", r"garbage|debris|swept|sweeping|dustbin|silt"),
    ...
]
def categorise(dept: str, name: str) -> str:
    n = name.lower()
    if dept in PUBLIC_DEPTS or n.startswith(("school -", "health -")):
        return "Public Buildings & Services"
    for cat, rx in CATEGORY_RULES:
        if re.search(rx, n):
            return cat
    return DEPT_FALLBACK.get(dept, "Other")''')
    sub(doc, "3.2 Joining the layers and splitting the status")
    code(doc, '''overlap = p.id.isin(c.id)                # 12,037 pothole IDs are already in layer 0
c = c.merge(p[overlap], on="id", how="left")
m = c.p_status.notna()
c.loc[m, "road_type"] = c.loc[m, "p_road_type"]
c.loc[m & c.p_invalid, "invalid"] = True # QuickFix flags potholes CCRS still calls Closed

def status(row):
    s = row.bmc_status
    if s == "CLOSED": return "Rejected" if row.invalid else "Resolved"
    return {"IN PROGRESS": "In Progress", "IN REVIEW": "In Review",
            "NEW": "Open", "DISCARDED": "Discarded"}.get(s)

df["reported_at"] = (pd.to_datetime(ms, unit="ms", utc=True)
                     .dt.tz_convert("Asia/Kolkata"))
df["has_location"] = inside_mumbai & ~on_placeholder_point''')
    sub(doc, "3.3 Loading the data in the browser")
    body(doc, "The browser fetches the compact CSV once and parses it with Papa Parse {{papa}}.")
    code(doc, '''export async function loadProblems(): Promise<Problem[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/problems.csv`);
  const parsed = Papa.parse<Record<string, string>>(await res.text(),
                                                    { header: true, skipEmptyLines: true });
  return parsed.data.map((r) => ({
    id: r.id, date: r.d, month: r.d.slice(0, 7), hour: +r.h,
    category: r.c, subcategory: r.s, ward: r.w, status: r.st,
    isOpen: OPEN_STATUSES.has(r.st), lat: +r.lat, lon: +r.lon,
    daysToClose: r.dc === "" ? null : +r.dc, channel: r.ch, escalated: r.esc === "1",
  }));
}''')
    sub(doc, "3.4 Reporting a problem")
    body(doc, "Figure 4 shows the flow. The browser validates the form first; the Vercel function validates again, assigns the ward on the "
              "server, limits each device to 10 reports a day and inserts the row with a human-readable tracking ID. Reporters are identified "
              "only by a salted hash of a random device ID and the IP address; no name, phone number or raw IP is stored. All user text is "
              "rendered as text, never as HTML.")
    code(doc, '''export function validateReport(body: Record<string, unknown>): NewReport | string {
  const category = clean(body.category, 60);
  if (!REPORTABLE.has(category)) return "Choose a problem type from the list.";
  const description = clean(body.description, LIMITS.description);
  if (description.length < 10) return "Describe the problem in at least 10 characters.";
  const lat = Number(body.lat), lon = Number(body.lon);
  if (!insideMumbai(lat, lon))
    return "The pin is outside Mumbai. Move the pin to the problem location.";
  const ward = wardAt(wards.features, lat, lon);
  if (!ward)
    return "The pin is outside BMC's 26 wards, for example in the sea. Move the pin onto land.";
  const landmark = clean(body.landmark, LIMITS.landmark);
  return { category, description, landmark, lat, lon, ward };
}''')
    figure(doc, D / "reportFlow.png", "Fig. 4: Reporting a problem and adding “I face this too”", width=5.0)
    sub(doc, "3.5 Ward lookup with a border tolerance")
    body(doc, "Ward outlines are simplified for the browser, which leaves slivers of a few metres between neighbouring wards. A point that "
              "falls in such a gap, for example at Andheri station, is assigned to the nearest ward within 150 m. On a sample of 4,850 "
              "complaints this matches BMC’s own ward label 98% of the time.")
    code(doc, '''export function wardAt(features: WardFeature[], lat: number, lon: number,
                       toleranceM = 150): string | null {
  for (const f of features)
    if (polygonsOf(f.geometry).some((p) => inPolygon(lon, lat, p))) return f.properties.ward;
  let best: { ward: string; d: number } | null = null;
  for (const f of features)
    for (const p of polygonsOf(f.geometry)) {
      const d = ringDistanceM(lon, lat, p[0]);
      if (d <= toleranceM && (!best || d < best.d)) best = { ward: f.properties.ward, d };
    }
  return best?.ward ?? null;
}''')
    sub(doc, "3.6 Group-by aggregation")
    code(doc, '''function value(a: Acc, m: Metric, pop?: number): number | null {
  switch (m) {
    case "count": return a.n;
    case "open_now": return a.open;
    case "fix_rate": {
      const closed = a.resolved + a.rejected;
      return closed ? +((100 * a.resolved) / closed).toFixed(1) : null;
    }
    case "median_days": { const v = median(a.days); return v === null ? null : +v.toFixed(1); }
    case "per_100k": return pop ? +((a.n * 100000) / pop).toFixed(1) : null;
  }
}''')
    body(doc, "runQuery() makes one pass over the filtered rows, accumulating counts, open and closed counts and days to fix per group "
              "(and per split group), then applies the minimum group size (HAVING), the hotspot rule (value ≥ mean + 0.5σ), ordering and "
              "Top-N. Medians are used instead of averages because days to fix is heavily skewed.")
    sub(doc, "3.7 Preset analytical queries")
    body(doc, "The Data Explorer offers eight preset questions. Each query below is the PostgreSQL the app generates for the Neon problems "
              "table; the same query runs in the browser over the static file. Results are in Section 4.")
    presets = json.loads((ROOT / "report" / "presets.json").read_text())
    for i, name in enumerate(presets, 1):
        para(doc, f"{i}. {name}", bold=True, before=6, after=3, keep_next=True)
        code(doc, presets[name]["sql"], size=8)

    # Technologies
    chapter(doc, "Technologies Used")
    for k, v in [
        ("React 19, Vite and TypeScript", "Single-page application, typed data models and the production build {{react,vite}}."),
        ("Tailwind CSS v4 and shadcn/ui (Radix UI)", "Styling and accessible interface components: buttons, selects, toggles, drawers, popovers and tables {{tailwind,shadcn}}."),
        ("MapLibre GL with the mapcn component and CARTO basemaps", "Vector map rendering, GPU clustering of 97,000 points, ward outlines and choropleths {{maplibre,mapcn,carto}}. Map data © OpenStreetMap contributors {{osm}}."),
        ("Recharts with evilcharts components", "Bar, stacked bar and line charts in the Data Explorer {{recharts}}."),
        ("PapaParse", "CSV parsing in the browser {{papa}}."),
        ("OpenStreetMap Nominatim", "Place search limited to Mumbai {{nominatim}}."),
        ("Vercel Functions and Neon PostgreSQL", "API for resident reports and the database that stores the unified dataset and reports (@neondatabase/serverless driver) {{vercel,neon}}."),
        ("PGlite", "Embedded PostgreSQL used by the local development server and for testing the database seed {{pglite}}."),
        ("Python 3, pandas, Shapely and Matplotlib", "Data acquisition, cleaning, joining, point-in-polygon ward assignment and EDA charts {{pandas,shapely,mpl}}."),
        ("BMC MARG ArcGIS REST service", "Source of complaint records, pothole records and ward boundaries {{marg}}."),
        ("tldraw", "Architecture, pipeline, schema and flow diagrams in this report {{tldraw}}."),
        ("pnpm and Playwright", "Package management, and browser testing and screenshots of the app."),
    ]:
        para(doc, k, bold=True, before=6, after=1, keep_next=True)
        para(doc, v, after=4)

    # 4. Results
    chapter(doc, "4. Results")
    sub(doc, "4.1 Exploratory data analysis")
    body(doc, "The analysis covers all 112,094 complaints in the unified dataset. Figure 5 shows the volume by category. Encroachment & Hawkers "
              "and Garbage & Cleanliness lead with about 20,000 and 19,000 complaints, followed by Drains & Sewage and Potholes.")
    figure(doc, E / "category.png", "Fig. 5: Complaints by category (all 112,094 complaints)", width=5.4)
    table(doc, ["Status", "Complaints", "Share"], [["Resolved", "52,261", "46.6%"], ["Rejected (closed as invalid)", "24,626", "22.0%"],
          ["In Progress", "14,326", "12.8%"], ["Discarded", "13,875", "12.4%"], ["In Review", "6,374", "5.7%"], ["Open", "632", "0.6%"]], [3.0, 1.4, 1.2])
    body(doc, "Across the city BMC fixed 68.0% of the complaints it closed and rejected the other 32.0% as invalid. Potholes have the highest "
              "rejection share (39.7%), followed by Street Lights (37.8%). 21,332 complaints were still open on 11 Oct 2026.")
    figure(doc, E / "hour.png", "Fig. 6: Complaints by hour of day in IST; the peak is 11:00", width=5.4)
    figure(doc, E / "days_to_close.png", "Fig. 7: Days from report to fix for resolved complaints (capped at 120 days)", width=5.4)
    body(doc, "Time to fix is heavily skewed: the median is 8.4 days but the mean is 23.3 days. By median, potholes are fixed fastest "
              "(2.0 days) and illegal construction slowest (45 days).")
    figure(doc, E / "ward_per_100k.png", "Fig. 8: Complaints per 100,000 residents by ward", width=5.0)
    body(doc, "Per-capita rates change the picture: the small island-city wards B and C file the most complaints per resident (about 1,400 per "
              "100,000), while the large eastern suburb M/East files the fewest (458 per 100,000) despite its size.")

    sub(doc, "4.2 The application")
    body(doc, "Screenshots of the running application follow. They were captured in a sandbox that could not reach the CARTO tile server, "
              "so the street basemap appears as plain land and sea colours; ward outlines, complaints and all interface elements are as deployed.")
    figure(doc, S / "f1-home.png", "Fig. 9: My Area before an area is chosen: search, location, ward picker and city figures over a map of clustered complaints")
    figure(doc, S / "f2-area.png", "Fig. 10: My Area for H/West after “Use My Location”: 1,090 open, fix rate 61% (rank 23 of 26), median 3.7 days to fix, and open problems within 500 m")
    figure(doc, S / "f3-report-form.png", "Fig. 11: Report a Problem: the resident moves the map under the pin; the form shows the ward and nearby open complaints of the same type")
    figure(doc, S / "f4-report-done.png", "Fig. 12: Report confirmation with tracking ID and the reminder to also file with BMC")
    figure(doc, S / "f5-wards.png", "Fig. 13: Ward Rankings by fix rate: Ward B leads with 82%; Ward A is last with 43%")
    figure(doc, S / "f11-mobile.png", "Fig. 14: Phone layout: map with a bottom sheet (left) and My Area for F/North (right)", width=4.2)

    sub(doc, "4.3 Preset query results")
    body(doc, "The Data Explorer results below cover the 96,998 complaints with a real map location.")
    figure(doc, S / "f6-explorer-month.png", "Fig. 15: Query 2, potholes by month: 128 in April, a peak of 4,540 in August, then 1,998 in September (October is partial)", width=5.6)
    figure(doc, S / "f7-explorer-fixrate.png", "Fig. 16: Query 4, wards with the lowest fix rate: Ward A 43.1%, F/North 53.6%, M/East 54.9%", width=5.6)
    figure(doc, S / "f8-explorer-slowest.png", "Fig. 17: Query 3, median days to fix by category: Illegal Construction 45.5 days; Mosquitoes, Pests & Animals 4.5 days", width=5.6)
    figure(doc, S / "f9-explorer-hotspots.png", "Fig. 18: Query 5, hotspot wards per 100,000 residents (threshold 983.7): B, C, K/South, P/South, H/West and A", width=5.6)
    figure(doc, S / "f10-explorer-channel.png", "Fig. 19: Query 8, filing channel per category: the MyBMC app is the main channel for every category", width=5.6)
    table(doc, ["Query", "Main result"], [
        ["1. Wards with most potholes", "Ward S 1,246; M/East 935; R/Central 891"],
        ["6. Open backlog by category", "Encroachment & Hawkers 4,242 open; Drains & Sewage 3,247; Roads & Footpaths 2,745"],
        ["7. Complaints by hour (IST)", "Peak at 11:00 (8,930); quietest at 04:00 (220)"],
    ], [2.4, 3.9])

    sub(doc, "Observations")
    for t in ("Closing a complaint is not the same as fixing it: almost a third of closed complaints were rejected as invalid, and this varies from 18% in Ward B to 57% in Ward A.",
              "Pothole complaints follow the monsoon, growing from April to a peak in August, and are fixed fastest (median 2 days) but also rejected most often.",
              "Illegal construction and repairs to public buildings take the longest to resolve (medians of 38 to 45 days).",
              "Per-capita rates identify the island-city wards B, C and A and the western suburbs K/South, P/South and H/West as hotspots.",
              "Residents file most complaints between 10:00 and 13:00 IST, mainly through the MyBMC app."):
        bullet(doc, t)
    sub(doc, "Limitations and caveats")
    for t in ("The data is a single seven-month snapshot (March to October 2026); October 2026 is a partial month.",
              "Complaints are not the same as problems: busier wards file more, and filing behaviour differs by channel.",
              "Time to fix uses the date of BMC’s “after” photo because the service publishes no true closure date for general complaints.",
              "Rejected means BMC closed a complaint as invalid; the data does not say whether the citizen agreed.",
              "Reports filed in this app are not sent to BMC; the app tells residents to also use the MyBMC app, the BMC website or the 1916 helpline.",
              "No explicit BMC licence: the data is used for non-commercial academic purposes with attribution."):
        bullet(doc, t)

    # 5. Conclusion
    chapter(doc, "5. Conclusion")
    for t in ("City Problems demonstrates an end-to-end civic-data workflow on the BMC MARG ArcGIS service: acquisition of 124,146 raw records, "
              "integration into one uniform table of 112,094 complaints, exploratory analysis, and an application that residents can use.",
              "The second version moves the focus from analysts to residents. A taxpayer can open the app, find their area and immediately see "
              "how many problems are open nearby, how their ward compares with the city, and what neighbours have reported. Reporting a problem "
              "takes a pin on the map, a category and a short description, and the report is stored in a Neon PostgreSQL database.",
              "Data preparation remains central to the quality of the results. Separating Resolved from Rejected changed the city fix rate "
              "from the 78.9% reported by the first version to 68.0%, converting to IST corrected dates and hours, and joining the pothole "
              "layer on ID removed double counting.",
              "Future work can refresh the data on a schedule to build a multi-year history, send resident reports to BMC through an official "
              "channel, add photos to reports, and move the browser-side aggregation to SQL views in Neon as the data grows."):
        body(doc, t)

    # 6. References
    chapter(doc, "6. References")
    missing = set(REFS) - set(CITED)
    if missing:
        raise SystemExit(f"References never cited in the text: {sorted(missing)}")
    for key, n in sorted(CITED.items(), key=lambda kv: kv[1]):
        p = para(doc, after=8, spacing=1.2)
        f = p.paragraph_format
        f.left_indent, f.first_line_indent = Cm(1.0), Cm(-1.0)
        f.tab_stops.add_tab_stop(Cm(1.0))
        run_font(p.add_run(f"[{n}]\t"), 11)
        for i, part in enumerate(REFS[key].split("*")):
            if part:
                run_font(p.add_run(part), 11, italic=bool(i % 2))

    doc.save(OUT)


def to_pdf():
    subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", str(REPORT), str(OUT)], check=True, capture_output=True)
    return OUT.with_suffix(".pdf")


def find_pages(pdf):
    """Page number of each chapter heading, read from the rendered PDF (the PAGE field equals the physical page)."""
    n = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout).group(1))
    pages = {}
    for p in range(5, n + 1):
        text = subprocess.run(["pdftotext", "-f", str(p), "-l", str(p), "-layout", str(pdf), "-"], capture_output=True, text=True).stdout
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        head = lines[1] if len(lines) > 1 else ""   # line 0 is the running header
        for name in TOC:
            if name not in pages and head == name:
                pages[name] = p
    return pages


if __name__ == "__main__":
    build({})
    pages = find_pages(to_pdf())
    build(pages)
    pdf = to_pdf()
    final = find_pages(pdf)
    print("TOC pages:", final)
    if final != pages or len(final) != len(TOC):
        sys.exit(f"Table of contents is out of date: {pages} vs {final}")
