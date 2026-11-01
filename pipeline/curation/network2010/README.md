# The 2010 transit network

`otc-pipeline network` builds `apps/web/public/data/network-2010.json` (format:
`packages/shared/src/network.ts`) from:

| File | Contents |
|---|---|
| `infrastructure.json` | The Transitway corridor (assembled from today's map data) and the 2010 stations, each with its confidence. `to_verify` lists the open questions. |
| `routes.json` | Service: routes, stop patterns, weekday headways by period, and provenance. |
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

**Listed but not mapped:** the other ~260 OC Transpo routes and all STO routes are in the
catalogue (number, fare class, termini), but the sources don't give their streets. They need OC
Transpo's 2010 GTFS, which is preserved by the Wayback Machine. `web.archive.org` resets every
connection from this build environment (the TLS handshake is cut after about 10 s; that's the
Archive's side, the proxy allows it). Run `otc-pipeline archive` from a machine that can reach it,
then `otc-pipeline network --gtfs <zip>`.

## Rules for adding a route by hand

Every route needs a `provenance` with a real source: an archived map or timetable URL with its
capture date, or GTFS. If a value is inferred, use `confidence: "low"`. Set `verified: true` only
after checking it against a primary 2010 source.

A pattern lists stop or station ids in order. Shapes are routed on the 2010 road and Transitway
graph between consecutive stops. Add `via` points (`[lon, lat]`) where the shortest path would leave
the real street. Running times come from road-class speeds plus dwell (see `network2010.py`).
