# The 2010 transit network

`otc-pipeline network` builds `apps/web/public/data/network-2010.json` (format:
`packages/shared/src/network.ts`) from:

| File | Contents |
|---|---|
| `infrastructure.json` | The Transitway corridor (assembled from today's map data) and the 2010 stations, each with its confidence. `to_verify` lists the open questions. |
| `routes.json` | Service: routes, stop patterns, weekday headways by period, and provenance. |
| *(a 2010 GTFS feed)* | `otc-pipeline network --gtfs FILE.zip` imports OC Transpo's own 2010 timetable instead, which is the preferred source. |

## Status (November 2026)

The infrastructure and the original O-Train are in. **The 2010 bus routes are not.** The archived
sources (Wayback Machine captures of OC Transpo's 2010 GTFS and system maps, and the December 2010
Wikipedia route lists) were blocked by this build environment's network policy. Run
`otc-pipeline archive` once `web.archive.org` is reachable. It searches for 2010 GTFS captures and
downloads them to `data/raw/archive/`.

## Rules for adding a route by hand

Every route needs a `provenance` with a real source: an archived map or timetable URL with its
capture date, or GTFS. If a value is inferred, use `confidence: "low"`. Set `verified: true` only
after checking it against a primary 2010 source.

A pattern lists stop or station ids in order. Shapes are routed on the 2010 road and Transitway
graph between consecutive stops. Add `via` points (`[lon, lat]`) where the shortest path would leave
the real street. Running times come from road-class speeds plus dwell (see `network2010.py`).
