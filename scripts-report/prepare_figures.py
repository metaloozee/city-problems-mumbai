#!/usr/bin/env python3
"""Copy screenshots from artifacts/screenshots into report/figures/ (logo is kept in place)."""
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
M = {"01-map-markers":"fig1-markers","02-heatmap":"fig2-heatmap","03-ward-choropleth-query-highlight":"fig3-choropleth",
     "04-query-chart-and-table":"fig4-q1","06-query-monthly-trend":"fig5-q2","07-query-hotspots":"fig6-q4",
     "08-query-slowest-categories":"fig7-q3","05-query-category-mix-stacked":"fig8-q5"}
for s, d in M.items():
    Image.open(ROOT/"artifacts/screenshots"/f"{s}.png").convert("RGB").save(ROOT/"report/figures"/f"{d}.png")
