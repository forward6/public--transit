# The 2010 transit network

`otc-pipeline network` builds `apps/web/public/data/network-2010.json` (format:
`packages/shared/src/network.ts`) from:

| File | Contents |
|---|---|
| `infrastructure.json` | The Transitway corridor (assembled from today's map data) and the 2010 stations, each with its confidence. `to_verify` lists the open questions. |
| `routes.json` | Service: routes, stop patterns, weekday headways by period, and provenance. |
| `places.json` | Hand-placed positions for 2010 route termini the gazetteer doesn't know (used to approximate the rest of the route tables). |
| *(a 2010 GTFS feed)* | `otc-pipeline network --gtfs FILE.zip` imports OC Transpo's own 2010 timetable instead, which is the preferred source. |

## Status (November 2026)

**Sources in use:** Wikipedia revisions dated just before the snapshot, fetched by
`otc-pipeline wiki`:

| Article | Revision | Date | Used for |
|---|---|---|---|
| OC Transpo routes | [397776188](https://en.wikipedia.org/w/index.php?oldid=397776188) | 20 Nov 2010 | the complete route table (272 routes) and the streets named in route notes |
| Transitway (Ottawa) | [389051515](https://en.wikipedia.org/w/index.php?oldid=389051515) | 6 Oct 2010 | the 2010 station list by segment (43 stations) |
| OC Transpo Route 95 (incl. 94, 101, 102) | [396801938](https://en.wikipedia.org/w/index.php?oldid=396801938) | 14 Nov 2010 | alignments and stated frequencies |
| OC Transpo Route 97 | [381629703](https://en.wikipedia.org/w/index.php?oldid=381629703) | 29 Aug 2010 | alignment and stated frequencies |
| Société de transport de l'Outaouais (fr) | [59348040](https://fr.wikipedia.org/w/index.php?oldid=59348040) | 18 Nov 2010 | the STO route table (101 routes) |

**Mapped:** 94, 95, 96, 97 (Transitway), 85, 106, 112, 118 and the O-Train. These are the routes
whose stations, streets and (for 94/95/97) frequencies the sources state. Each route's `provenance`
says what was stated and what is estimated.

**Approximated (the rest):** OTC is a game, so the other routes of the 2010 route tables are
built by `approx.py`. That's 208 OC Transpo and STO routes, of which 19 are skipped; see
`data/reports/approx_routes.json`.

- Each route goes through the places its 2010 row lists (termini and "via" bridges). The places
  are found among the stations, Overture places and neighbourhoods, and the hand-placed names in
  `places.json`.
- Routes are routed on the 2010 streets. Local routes keep off highways and the Transitway;
  peak, express and commuter routes may use them, and stop less often.
- Service is the typical weekday pattern of the route's fare class. Peak and express routes run
  inbound in the morning and outbound in the afternoon.
- Each is marked `confidence: "low"` with a note.
- Not generated: school, Scotiabank Place event, early-morning and STO partner trips, and rural
  commuter routes from towns beyond the map (Perth, Cornwall, Casselman…).

To improve a route, add it to `routes.json` (it then wins over the approximation), or fix a place
in `places.json`.

**Upgrade path:** OC Transpo's own 2010 GTFS (preserved by the Wayback Machine) would replace the
approximations route by route. `web.archive.org` resets every connection from this build
environment, so the **Archive 2010 GTFS** GitHub workflow searches for it instead and publishes
what it finds to the `data/gtfs-2010` branch. Import it with
`otc-pipeline network --gtfs <zip>` (repeatable, e.g. for STO).

## Rules for adding a route by hand

Every route needs a `provenance` with a real source: an archived map or timetable URL with its
capture date, or GTFS. If a value is inferred, use `confidence: "low"`. Set `verified: true` only
after checking it against a primary 2010 source.

A pattern lists stop or station ids in order. Shapes are routed on the 2010 road and Transitway
graph between consecutive stops. Add `via` points (`[lon, lat]`) where the shortest path would leave
the real street. Running times come from road-class speeds plus dwell (see `network2010.py`).
