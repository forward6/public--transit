# OTC data pipeline

Builds the **Ottawa–Gatineau base map as of 1 December 2010** that the web app loads.

```bash
cd pipeline
uv sync                      # Python 3.11+, installs pyarrow, shapely, rasterio, freetype, …
uv run otc-pipeline all      # about 3 minutes on 4 cores; needs internet access (see Sources)
uv run pytest -q             # offline unit tests
```

| Step | What it does | Output | Time |
|---|---|---|---|
| `fetch` | Overture Maps bbox download (anonymous S3), keeping the provenance of the oldest OSM element per feature | `data/raw/overture/*.parquet` (~100 MB) | ~80 s |
| `curate` | Reconstructs December 2010 (below) | `data/build/2010/*.parquet`, `data/reports/2010/` | ~25 s |
| `terrain` | NRCan CDEM 16 m window → Terrarium elevation tiles z7–12 | `apps/web/public/data/terrain.pmtiles` (~5 MB) | ~45 s |
| `tiles` | Vector tiles z7–14 per `packages/shared/src/tile-schema.json` | `apps/web/public/data/basemap-2010.pmtiles` (~26 MB) | ~30 s |
| `glyphs` | SDF label glyphs for Inter and Source Serif 4 | `apps/web/public/glyphs/` (committed) | ~10 s |

Generated data is gitignored. Only the glyphs, which are small and stable, are committed.

## How "2010" is reconstructed

Overture describes today's city. `curate2010.py` turns it back into December 2010:

1. **Date the OSM data.** OSM element IDs are issued in sequence, and a version-1 element's
   timestamp is its creation time. From about 270,000 such elements in the region, the snapshot
   threshold is calibrated at **way ID 84,830,956**, which misclassifies 0.1% of them. Anything mapped
   below it existed on the map in 2010.
2. **Find post-2010 development.** These are compact, dense clusters of newly mapped local streets
   that are far from 2010 streets, buildings and residential areas. Long, thin clusters, such as
   re-mapped rural roads, are rejected. That leaves 257 zones (154 km²), almost all of them known
   growth areas: Half Moon Bay, east Riverside South, Findlay Creek, Kanata West, Stittsville,
   east Orléans, and the Plateau and north of Gatineau.
3. **Remove what was built later.** In those zones: streets, buildings (about 80k of 546k), small
   parks, stormwater ponds and neighbourhood names. The land is shown as fields, and
   residential areas are cut back to their 2010 extent.
4. **Apply curated facts** from [`curation/`](curation/): the Confederation Line, Rapibus, Vimy
   Memorial Bridge, Zibi and Lansdowne are removed; the parkways get their 2010 names; the
   Prince of Wales Bridge is restored as a disused rail bridge; the original O-Train corridor is
   kept.

**Review:** run `uv run python -m otc_pipeline.diagnostics [W S E N]` for a PNG of
kept and removed streets. In the app, add `?history=1` to hatch post-2010 development.

**Known limits:** buildings demolished since 2010 can't be recovered. Towers added in already
developed areas, such as downtown infill, aren't detected. Fidelity tiers are in `docs/PLAN.md` §3.3.

## Sources and licences

| Data | Source | Licence |
|---|---|---|
| Streets, rail, water, land use, buildings, places | [Overture Maps](https://overturemaps.org) release `2026-10-21.0` (largely from OpenStreetMap) | ODbL (© OpenStreetMap contributors) / CDLA-Permissive 2.0 |
| Elevation | [NRCan CDEM](https://open.canada.ca/data/en/dataset/7f245e4d-76c2-4caa-951a-45d1d2051333) | Open Government Licence – Canada |
| Fonts (glyphs) | Inter, Source Serif 4 via Fontsource (npm) | SIL Open Font License 1.1 |
