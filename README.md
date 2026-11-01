# Ottawa Transit Commissioner (OTC)

A browser-based transit simulator set in the real Ottawa–Gatineau region. It starts in December
2010: you chair Ottawa's Transit Commission and redesign the capital's transit system, balancing
coverage, accessibility, cost, ridership and public support. Gatineau's STO runs separately, with
its own agenda. The whole thing plays out on an elegant, living 2.5D map. It runs in the browser
on desktop, iPad and phone.

**▶ Play it: <https://forward6.github.io/public--transit/>** (desktop, iPad and phone). It's
rebuilt and republished on every push by `.github/workflows/pages.yml`.

![The 2010 base map, winter](docs/screenshots/m1/overview-winter.jpg)

**Status:**

- M0 (project skeleton) and M1 (the 2010 base map) are done.
- M2 is done. The whole OC Transpo and STO network runs on a game clock: 226 routes, about
  12,400 weekday trips, 6,400 stops and ~880 buses at the morning peak.
  - **OC Transpo** runs to its own timetable: 148 routes and every stop, from the closest feed the
    Internet Archive preserved. That's August 2011, just before the September 2011 restructuring.
  - **STO** and the few OC Transpo routes missing from that feed are approximated from the
    November 2010 route tables.
- M3 is under way, and people ride. A first demand model gives 2.87 million weekday trips, 13.7% of
  them by transit, and about 580,000 boardings, calibrated to 2011
  ([report](docs/calibration/2011.md)). Open the **Ridership** panel from the top bar, or switch
  on **Riders** to see where people travel.
- M4 is under way: the first playable version. Press **Plan** to:
  - change any route's service, or remove it;
  - draw new routes on the map (they follow the streets and get stops automatically);
  - see travel times from anywhere;
  - **Evaluate** your plan on a Scorecard against 2010 (riders, coverage, jobs within reach,
    cost).

![Plan mode: a new route in Kanata, evaluated](docs/screenshots/m4/plan-scorecard.jpg)

- M5 is under way: money and fleet.
  - **The campaign** starts at 00:01 on Wednesday 1 December 2010, with the 2011 budget to set.
  - **The calendar runs on the clock.** Watch a day in real time, or speed up to 2 hours or
    1 day per second to watch the weeks go by. The season follows the date, and night falls at
    Ottawa's real sunset. Weekends and holidays run fewer buses and carry fewer riders.
  - **Your plans** take effect at the next service change. The demand model measures them when
    you schedule them. Riders then find new service over a few weeks, and leave a cut route
    within days.
  - **Riders day by day:** the top bar shows yesterday's riders against the same day last week.
    The **Ridership** panel charts the last twelve weeks with each service change marked, and
    follows the routes your changes touched.
  - **The books:** tap the **Reserve** chip to see revenue and costs, and to order buses or
    build garages.
  - **Each autumn** brings a budget. Run out of money and you must choose: raise the levy, cut
    service, defer maintenance or borrow.

![Riders day by day: a December service change settling in](docs/screenshots/days/ridership-daily.jpg)

- M6 is under way: opinion and media.
  - **The public reacts.** Every Ottawa neighbourhood has an opinion of the Commission (service,
    value for money, trust) that moves day by day with service, reliability, crowding, the
    weather, fares, taxes and the news. Tap the **Approval** chip, or switch on **Opinion** to see
    it on the map; every number has a "why".
  - **Follow a rider:** six fictional riders, from Marc's Orléans commute to Lise's missing bus in
    Manotick, ride the real network and keep diaries.
  - **The papers:** a front page every month, and a feed of what people are saying.
- **Where the load is:** switch on **Riders** for peak crowding. Every stretch shows its morning
  peak-hour riders against the places on the buses and trains scheduled through it (all routes
  together), from room to spare to over capacity, for the network in operation. The **Where the load
  is** panel lists the busiest and most crowded stretches, the routes under pressure and the busiest
  stations.

![Where the load is: the morning peak, crowding against capacity](docs/screenshots/m6/load-panel.jpg)

![Public opinion, neighbourhood by neighbourhood](docs/screenshots/m6/opinion-panel.jpg)

![The 2012 budget](docs/screenshots/m5/budget-2012.jpg)

![The 2010 network at 8:10 am](docs/screenshots/m2/network-2010-overview.jpg)

See the [roadmap](docs/PLAN.md#12-roadmap).

## Run it

```bash
pnpm install                                   # Node 20+ and pnpm 10
(cd pipeline && uv sync && uv run otc-pipeline all)   # builds the 2010 map data (~3 min, needs internet)
pnpm dev                                       # http://127.0.0.1:5173
```

URL options:

- `?lang=en|fr`
- `&season=winter|spring|summer|autumn` and `&time=day|night` pin the look (the calendar and the
  sun set it otherwise)
- `&3d=0`
- `&history=1` hatches post-2010 development
- `&layout=phone|tablet|desktop`
- `&t=HH:MM` sets the time of day (a new game starts at 00:01; a saved one resumes where it was)
- `&speed=0..5` sets the speed: pause, real time, 1 min/s, 15 min/s (the default), 2 h/s, 1 day/s
- `&select=stop:carleton|route:oct-otrain|vehicle:oct-otrain|persona:marc|opinion:city|load:peak` opens an inspector
- `&riders=1` turns on the Riders view (peak crowding; `&rv=daily` for riders per day); `&opinion=1` the Opinion view (`&ov=service|value|trust` for an axis)
- `&plan=1` opens Plan mode. Add `&iso=lon,lat` for travel times from a point, or
  `&draw=lon,lat;lon,lat;…` to sketch a route.

The camera position is kept in `#view=zoom/lat/lng/bearing/pitch`.

## Repository

| Path | What |
|---|---|
| [`apps/web`](apps/web) | The game client: Vite, React, MapLibre GL and PMTiles; responsive desktop, iPad and phone layouts |
| [`packages/shared`](packages/shared) | Region definition and the vector-tile contract (`tile-schema.json`) shared with the pipeline |
| [`packages/sim`](packages/sim) | Simulation core: weekday timetables and vehicle playback (M2); RAPTOR routing, the demand model and transit assignment (M3) |
| [`pipeline`](pipeline) | Python data pipeline: Overture data and NRCan elevation, reconstructed to the 2010 city, written as PMTiles |
| [`docs`](docs) | [Plan](docs/PLAN.md) and [visual design](docs/VISUAL_DESIGN.md) |
| [`prototype/visual`](prototype/visual) | The throwaway visual prototype behind the design screenshots |

Checks: `pnpm check` (typecheck, test, build) and `cd pipeline && uv run pytest`. CI runs both.
The *Publish the game* workflow builds the map data with `otc-pipeline all` on GitHub's servers
and publishes the app to GitHub Pages. It needs one setting: Settings → Pages → Source: GitHub
Actions.

Map data © OpenStreetMap contributors and the Overture Maps Foundation. Elevation © Natural
Resources Canada. Fonts are under the SIL OFL.
