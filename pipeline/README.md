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
| `wiki` | Wikipedia revisions as of 1 Dec 2010: the 2010 route catalogue (OC Transpo and STO) and the Transitway station list | `data/build/2010/route_catalogue.json` | ~2 min (rate-limited) |
| `network` | The 2010 transit network: Transitway corridor, stations, O-Train and routes (`--gtfs FILE.zip` imports a feed) | `apps/web/public/data/network-2010.json` | ~10 s |
| `archive` *(not in `all`)* | Searches the Wayback Machine for 2010 OC Transpo and STO GTFS captures and downloads the closest | `data/raw/archive/*.zip` | — |

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

## The 2010 transit network (M2)

`network2010.py` builds a routable 2010 street and Transitway graph (55k nodes) and
assembles the **Transitway** from three sources:

- today's busways, dated by OSM ID
- the corridor later converted to O-Train Line 1, with the downtown tunnel removed
- the Albert/Slater surface lanes.

It places **26 stations** using Overture place positions snapped to the corridor, and routes each
pattern's shape along the graph. Running times come from road-class speeds (12 km/h downtown)
plus dwell. Curation lives in [`curation/network2010/`](curation/network2010/).

**Status:** the whole 2010 network is built: 217 routes and about 13,500 weekday trips.

- **Sourced:** 8 bus routes plus the O-Train follow dated Wikipedia revisions (the `wiki` step).
- **Approximate:** the rest of the November 2010 route tables are approximated by `approx.py`.
  Each route is routed between the places its row lists, with service typical of its fare class.
  It's a game, so "right enough" is the goal.

See [`curation/network2010/README.md`](curation/network2010/README.md).

OC Transpo's own 2010 GTFS would replace the approximations. The Wayback Machine resets
connections from this build environment, so the **Archive 2010 GTFS** workflow
(`.github/workflows/archive-2010.yml`) runs the search on GitHub's servers instead. It publishes
any feeds it finds, with a `report.json` of every capture checked, to the `data/gtfs-2010` branch:

```bash
git fetch origin data/gtfs-2010 && git archive origin/data/gtfs-2010 | tar -x -C data/raw/archive
uv run otc-pipeline network --gtfs data/raw/archive/octranspo_2010MMDD.zip
```

The search also runs on any machine with Python 3.11+ and no other dependencies:
`python3 pipeline/src/otc_pipeline/archive.py --out gtfs-2010` (or `uv run otc-pipeline archive`).

The GTFS importer (`gtfs.py`) does the following:

- picks the weekday service of 1 December 2010 (or the nearest weekday)
- groups trips into stop patterns and keeps every departure
- derives AM-peak run times and dwells, interpolating blank (non-timepoint) times by distance
- routes shapes on the 2010 graph when the feed has no `shapes.txt`
- merges the platforms of curated stations ("HURDMAN 2A") into the station
- classifies routes as Transitway, frequent, local or peak
- replaces the reconstructed or approximated route with the same number.

It is tested on synthetic feeds.

## Sources and licences

| Data | Source | Licence |
|---|---|---|
| Streets, rail, water, land use, buildings, places | [Overture Maps](https://overturemaps.org) release `2026-10-21.0` (largely from OpenStreetMap) | ODbL (© OpenStreetMap contributors) / CDLA-Permissive 2.0 |
| Elevation | [NRCan CDEM](https://open.canada.ca/data/en/dataset/7f245e4d-76c2-4caa-951a-45d1d2051333) | Open Government Licence – Canada |
| Fonts (glyphs) | Inter, Source Serif 4 via Fontsource (npm) | SIL Open Font License 1.1 |
