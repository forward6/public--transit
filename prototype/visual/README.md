# OTC visual prototype

A throwaway-but-faithful prototype of the **Ottawa Transit Commissioner** look. It renders the
screenshots in [`docs/VISUAL_DESIGN.md`](../../docs/VISUAL_DESIGN.md) with real Ottawa–Gatineau
map data in the same browser stack the game will use (MapLibre GL).

```
pipeline/  Python: fetch Overture Maps data, then build the scene layers
web/       index.html + style.js (palettes, layer stack) + scenes.js (cameras, HUD) + app.js
tools/     render.cjs: headless-Chromium screenshot renderer (Playwright)
data/      generated GeoJSON (gitignored, about 100 MB)
```

## Rebuild and render

```bash
# 1. Python deps (one-off)
python3 -m venv /tmp/otc-venv && /tmp/otc-venv/bin/pip install pyarrow shapely

# 2. Data: about 1 minute. Downloads a bbox of Overture Maps (anonymous S3) around downtown Ottawa and Hull
/tmp/otc-venv/bin/python pipeline/fetch_overture.py data
/tmp/otc-venv/bin/python pipeline/build_scene.py data        # 2010 network approximation, vehicles, buildings
/tmp/otc-venv/bin/python pipeline/build_plan_scene.py data   # draft line + travel-time bloom

# 3. Web deps and a static server (serve this folder, not web/)
(cd web && npm install)
python3 -m http.server 8765 --bind 127.0.0.1 &

# 4. Open http://127.0.0.1:8765/web/index.html?scene=day   (or night, plan)
#    or render PNGs headlessly:
node tools/render.cjs http://127.0.0.1:8765 ../../docs/screenshots day,night,plan
```

## What is real and what is not

- **Real:** streets, rail, rivers, parks, building footprints and heights (Overture Maps release
  2026-10-21, derived in part from OpenStreetMap). Note that this is *today's* city. The game's
  pipeline (PLAN.md §11) rebuilds the December 2010 state.
- **Approximate:** the 2010 Transitway (today's busways plus the corridor the Confederation Line
  took over, with the downtown tunnel swapped back to Albert/Slater), the original O-Train, and bus
  and STO routes traced along named streets.
- **Illustrative:** every number in the HUD, the vehicles' positions, the travel-time bloom (a
  simple walk + ride + wait graph), the people and the headlines.

## Attribution

Map data © OpenStreetMap contributors (ODbL) and the Overture Maps Foundation. Fonts: Inter and
Source Serif 4 (SIL Open Font License).
