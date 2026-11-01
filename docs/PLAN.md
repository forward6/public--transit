# Ottawa Transit Commissioner (OTC)

**Game design & technical plan · v0.5 · 1 November 2026**

> An Ottawa–Gatineau transit simulator. The look is defined in [`VISUAL_DESIGN.md`](VISUAL_DESIGN.md),
> with screenshots from the working visual prototype.

---

## 0. Decisions so far

| Topic | Decision |
|---|---|
| Platform | Web browser (WebGL2, with WebGPU later) on **desktop, iPad and phone**. Installable as a PWA; nothing needed from an app store. |
| Visual style | An elegant 2.5D "living map": geographically exact top-down cartography, glowing routes and moving vehicles. **Calm by default; cinematic 3D when you zoom in.** Real-world line colours. See [`VISUAL_DESIGN.md`](VISUAL_DESIGN.md). |
| Agency names | **Real:** OC Transpo, STO, Para Transpo, Transitway, O-Train. No real logos. |
| Region | The whole City of Ottawa (urban, suburban and rural) plus the City of Gatineau. |
| Start state | **Campaign:** the real 2010 network (OC Transpo and STO). **Sandbox:** the real 2010 city with no transit. |
| History after 2010 | **Fully player-driven.** The city is exact on day one and then grows in response to your decisions. Nothing after 2010 is scripted. |
| Simulation | **Hybrid:** zone-based demand calibrated to the 2011 National Capital Region origin–destination survey, plus a sample of individual riders you can follow. |
| Politics | **Full civic layer:** council votes, elections, provincial and federal funding, fares and the transit levy, labour, media and opinion maps. |
| Title | **Ottawa Transit Commissioner (OTC).** |
| Player role | Chair of Ottawa's Transit Commission. |
| Gatineau | **STO runs separately.** It is an AI agency with its own council, budget and political agenda. It collaborates through negotiated agreements, but its interests can clash with yours. |
| Failure | **Soft consequences.** Things can get very hard, but it is never game over. |
| Modes | Bus and BRT (Transitway), LRT/metro, commuter and regional rail, on-demand and para-transit, and the unusual modes: ferries, gondolas and streetcars. |
| Team | Solo hobby project. Claude writes most of the code; you direct and playtest. |
| Languages *(assumed)* | English and French from day one. Ottawa is officially bilingual and Gatineau is francophone. |
| Council (M7) | **Only the big items go to a vote:** budgets, deficit choices, large service plans, big bus orders and garages. Routine changes are yours. The 2010 council starts **split**. **Labour talks open in 2011.** STO is a **light-touch partner with its own agenda**. |

---

## 1. Vision

### Elevator pitch

> *It's December 2010. Buses are bumper-to-bumper on Albert and Slater, Gatineau's riders pour
> across the bridges every morning, and the suburbs are growing faster than service can keep up.
> You've just been named chair of the Transit Commission.* Redesign the capital's transit system on
> a living map of the real Ottawa–Gatineau, and keep the public, council and the budget on your side
> long enough to see it through.

### Design pillars

1. **The real place, honestly modelled.** Every street, river, bridge, ward and neighbourhood is
   where it was in 2010. Costs, demand and ridership are calibrated to real data, so what you learn
   in the game is true of Ottawa.
2. **The map is the game board, and it is beautiful.** No clutter. The world is calm and
   cartographic, transit is the hero, and light, seasons and motion make it worth just watching.
3. **Every rider counts.** Coverage and accessibility (step-free travel, para-transit, winter,
   low-income riders, rural residents) are first-class goals. You can follow any individual rider and
   see the network through their day.
4. **Politics is gameplay, not punishment.** Opinion, council and money are levers and puzzles.
   Losing support makes things harder but never ends the game.
5. **Explain everything.** You can click any number and see why it is what it is (the "Why?"
   panel). That makes the game good for hobbyists and for learning.

---

## 2. The player's role and the core loop

### 2.1 Role: Chair of the Transit Commission (Ottawa)

You propose, council decides.

- **What you control directly:** the network (routes, stops, frequencies, span of service), stop
  amenities, fleet orders within budget, fare changes within a council-approved band, service-change
  timing, and project proposals.
- **What needs council approval:** the annual transit budget and transit levy, fare changes outside
  the band, capital projects over a threshold, new garages, rapid-transit lines, interprovincial
  agreements and changes to the urban boundary.
- **Gatineau (STO) runs separately.** It is an **AI agency** with its own board, budget, Quebec
  funding, elections and **political agenda**.
  - **How you work together:** you collaborate through negotiated agreements (cross-river routes,
    shared stations, fare integration, joint projects and cost-sharing).
  - **Where it gets difficult:** STO also pursues its own priorities. For example, Rapibus comes
    first, or a Gatineau election swings toward a tram along Wellington. It can act unilaterally,
    for instance by moving its routes through downtown Ottawa. It can stall or refuse your
    cross-river projects. Relations ("Cordial", "Wary", "Strained" and so on) are tracked in the
    top bar and shift with how you treat it.
  - **No direct control:** you never run Gatineau's network in the campaign. A sandbox option can
    let you plan both networks.

### 2.2 Core loop

```
  Observe ──► Plan ──► Win approval ──► Build ──► Operate ──► Public reacts
     ▲                                                             │
     └─────────────────────────────────────────────────────────────┘
```

| Step | What you do | What the game does |
|---|---|---|
| Observe | Look at overlays (demand, crowding, reliability, opinion, equity), rider stories and headlines. | Explains problems with "Why?" drill-downs. |
| Plan | Draw and edit routes, stops and frequencies; propose projects; set fares. | Shows instant previews: riders, cost, coverage, who gains and who loses. |
| Win approval | Bring items to the commission and council, apply for funding, run consultations. | Councillors vote; funders accept or reject; consultations reveal issues. |
| Build | Choose procurement and phasing. | Construction takes real time and causes disruption and detours. |
| Operate | Watch, tweak and respond to incidents. | Vehicles bunch, break down and get stuck in snow; crowds form. |
| Public reacts | Respond in the press, adjust or hold course. | Ridership, opinion and the treasury move. Elections happen every four years. |

### 2.3 Calendar and pacing

- **Start date: Wednesday 1 December 2010 at 00:01**, the first day of the 2010–2014 council term.
  Your first task is the 2011 budget. *(Open question 2)*
- **The yearly rhythm:**
  - Winter: operations and storms.
  - Spring: service change.
  - Summer: construction season and festivals.
  - September: service change. Students return, which brings the biggest jump in demand.
  - Autumn: budget.
  - December: holiday service.
- **Time controls:** one clock, running continuously through the days.
  - Pause.
  - **Real time**, to watch a day as it happens.
  - **1 min/s and 15 min/s** to watch buses, and **2 h/s** to watch the day go by.
  - **1 day/s:** the weeks go by and the riders chart fills; vehicles are hidden.
  - The game auto-pauses on decisions.
  - The calendar sets the season and the sun sets day and night; there are no toggles.
  - **Still to do:** skip to the next decision.
- **Campaign length:** December 2010 to the end of 2030 (five council terms), then endless mode.
  A full campaign should take roughly 15–25 hours of play. *(Open question 6)*
- **Election calendar:**
  - Ottawa: October 2014, 2018, 2022, 2026 and 2030.
  - Gatineau: November 2013, 2017, 2021, 2025 and 2029.
  - Provinces and the federal government: generated on a realistic cycle (see §7.1).
- **Difficulty presets:**
  - **Planner:** generous budgets and no cost overruns.
  - **Commissioner:** the default.
  - **Realist:** real unit costs, overrun risk and slow approvals.

---

## 3. The world: Ottawa–Gatineau in December 2010

### 3.1 Geography that shapes transit

- **The Ottawa River** is the provincial border. The core has only five road bridges (Champlain,
  Chaudière, Portage, Alexandra and Macdonald-Cartier), plus the **disused Prince of Wales rail
  bridge** and a few car ferries further out. Every cross-river trip has to squeeze through these.
- **Barriers and green space:** the Rideau River and Canal, the Gatineau River, the NCC Greenbelt,
  the Central Experimental Farm, Gatineau Park and the Eardley escarpment.
- **Where the jobs are:**
  - Downtown and the Parliamentary precinct.
  - Federal campuses: Tunney's Pasture, Confederation Heights, and Place du Portage and Terrasses
    de la Chaudière in Hull.
  - Hospitals.
  - Universities and colleges: uOttawa, Carleton, Algonquin, La Cité, UQO and Cégep de l'Outaouais.
  - The Kanata North tech park.
- **Where the people are:**
  - The inner city.
  - Suburbs beyond the Greenbelt: Kanata/Stittsville, Barrhaven/Riverside South and Orléans.
  - Gatineau's sectors: Hull, Gatineau, Aylmer, Masson-Angers and Buckingham.
  - Rural villages: Manotick, Richmond, Carp, Metcalfe, Navan, Cumberland, Constance Bay and others.
- **Winter.** Ottawa is one of the world's coldest capitals. Winter shortens how far people will walk,
  hurts reliability and turns open-air waits into opinion damage. It is also beautiful: the Rideau
  Canal Skateway, snow-covered hills.

### 3.2 The starting network (campaign)

*Every figure is loaded from data during the data phase (§11). This table lists what the data
phase must confirm and how each element creates gameplay.*

| Element | State in December 2010 | Gameplay hook |
|---|---|---|
| **Transitway (BRT)** | Dedicated busways (West, Southwest, East, Southeast) feeding downtown through reserved lanes on Albert and Slater. | **The downtown "bus wall."** The surface lanes are near capacity at peak. This is the central problem of the campaign's first act. |
| **O-Train** | The original diesel line, Bayview–Greenboro (opened 2001, 5 stations). | Extend it, electrify it, double-track it, or leave it alone. |
| **Bus network** | Frequent trunk routes, many peak-only suburban express routes and local routes. | Complex and overlapping, so there are big redesign opportunities: grids, trunks and feeders. |
| **Park & rides** | Along the Transitway. | Cheap ridership, but the land might be better used for development. |
| **Para-transit** | Door-to-door service for eligible riders. | Trip-denial rates, booking capacity and eligibility policy. |
| **Downtown LRT plan** | Approved in principle, with provincial and federal funding pledged in 2009 *(verify amounts)*. Not yet contracted. | Keep it, change it or redirect it. The money comes with strings. |
| **STO (AI)** | A bus network focused on Hull and downtown Ottawa. The Rapibus busway is planned but not open. | Negotiate integration. STO's AI decides whether to build Rapibus based on funding and your choices. |
| **Rail corridors** | VIA lines toward Montréal and Toronto, freight lines, the Gatineau-side rail corridor and the disused Prince of Wales Bridge. | Options for commuter and regional rail, which need track-access deals. |
| **Fares** | Separate OC Transpo and STO fare systems, paper tickets and passes, no smart card yet. | A fare-technology project, and fare integration across the river. |
| **Public memory** | The long transit strike of winter 2008–09. | Labour relations start out fragile and sensitive. |

### 3.3 What "exact" means: fidelity tiers

| Tier | What | How exact |
|---|---|---|
| **A: exact** | Rivers and shorelines; road and rail geometry; bridges; ward boundaries; population and jobs by census area; 2010 routes and stops. | Matches source data. |
| **B: accurate in aggregate** | Travel demand and mode share by district, river-crossing volumes, costs, budgets, fleet. | Calibrated to targets (§11.4). |
| **C: representative** | 2010 building footprints and heights, individual riders, councillor personalities, media. | Plausible and consistent, with fictional people. |

### 3.4 Player-driven growth after 2010

- The city is exact on 1 December 2010. **After that nothing is scripted:** no Lansdowne
  redevelopment, no Zibi and no Confederation Line unless you, or AI actors reacting to you, make
  them happen.
- **How much the region grows:** a baseline of natural increase plus migration (about 1–1.5% a
  year), nudged up or down by a regional attractiveness score. That score reflects job
  accessibility, an affordability proxy and quality of life.
- **Where growth goes:** each year, new households and jobs are allocated to zones by a land-use
  model. It weighs accessibility by transit and by car, zoning capacity, available land (the
  Greenbelt and Gatineau Park are protected) and developer appetite.
  - Good rapid transit pulls growth to stations (transit-oriented development).
  - Car-only growth sprawls to the suburban edge.
- **Developer proposals** arrive as events. For example: *"Developer offers 2,400 units at Bayview if
  a rapid-transit station is committed within 5 years."* If you accept, it goes to a council vote and
  you get the density. If you refuse, the growth goes elsewhere.
- **Urban boundary debates** come up once per term. Expanding the boundary means more sprawl and a
  stronger roads lobby.
- **Recurring calendar events** are allowed because they are calendar facts, not history: Canada
  Day, Winterlude, Bluesfest, the Tulip Festival and the September university return.
- **Random, non-historical events:** ice storms, deep-freeze weeks, spring floods, bridge repair
  closures, labour disputes and an optional pandemic-style demand shock. *(Open question 8)*

---

## 4. Simulation design (hybrid)

### 4.1 Spatial model

- **Demand zones:** 2011 census *dissemination areas*. There are roughly 2,000 across Ottawa and
  Gatineau (the exact count comes from the data). They are grouped into origin–destination survey
  districts for calibration and reporting, and into wards for politics.
- **Road graph:** 2010 OpenStreetMap roads, simplified to about 50,000 links. Bus routes snap to
  this graph.
- **Transit graph:** stops, patterns and timetables in an internal GTFS-like model.
- **Visual grid:** H3 hexagons at resolution 9 (about 0.1 km² each) for smooth heatmaps.

### 4.2 Synthetic population

- About **1.23 million residents** across Ottawa and Gatineau (the 2011 survey area). Each zone holds
  counts of **household segments** rather than individual people. The segments describe age band,
  income band, car availability, disability, student or worker status, work schedule and language.
- The segments are built with iterative proportional fitting from 2011 census and 2011 NHS tables,
  with the 2006 long-form census as a fallback.
- The result is about 2,000 zones × about 24 segments. That is cheap to compute and rich enough to
  drive equity and opinion.

### 4.3 Demand model

Demand is computed for a representative weekday, Saturday and Sunday. Each day is split into six
periods: early, AM peak, midday, PM peak, evening and night.

1. **Trip generation** by purpose (work, school, post-secondary, shopping, medical, social) and by
   segment.
2. **Destination choice:** a logit model with size terms (jobs, enrolment, retail floor space) and
   composite accessibility (logsums).
3. **Mode choice:** a nested logit across car driver, car passenger, transit with walk access,
   park & ride, kiss & ride, walk, and bike (which depends on the season). The utility terms are:
   - in-vehicle time
   - wait time (weighted ×2)
   - walking (×2, rising to ×3 in deep cold)
   - a transfer penalty
   - a crowding multiplier
   - reliability (the spread of travel times)
   - fare
   - downtown parking cost
   - comfort (shelters, heated shelters, real-time signs)
   - a hard step-free requirement for segments with a mobility disability.
4. **Calibration:** alternative-specific constants per district, so that the 2011 base year
   reproduces the origin–destination survey's mode shares (regional transit share about 13.5%) and
   the screenline counts (river bridges, Greenbelt crossings and the downtown cordon).

### 4.4 Transit assignment and performance

- **Skims:** RAPTOR one-to-all routing from each zone for each period, run in a Web Worker pool.
  That is about 2,000 runs per period.
- **Capacity-constrained assignment:** 3–5 iterations with crowding penalties. When vehicles are
  full they **pass riders up**, which is visible on the map and hurts opinion.
- **Fast preview while editing:** re-evaluate a sample of about 10% of zones, weighted toward the
  area being changed, in under a second. The full evaluation runs in the background and again at
  each service change.
- **Road congestion:** a light static assignment on major roads (BPR curves), calibrated to 2010.
  Car volumes respond to mode shift.
  - Buses in mixed traffic inherit the congestion.
  - Bus lanes, the Transitway, signal priority and queue jumps let them escape it.

### 4.5 Operations simulation (the moving picture)

- **Vehicles:** every vehicle in service is simulated mesoscopically along its pattern.
  - Segment run times come from congestion.
  - Dwell time depends on boardings, alightings, fare payment type and floor height.
  - So **bunching emerges naturally** rather than being scripted.
- **Fleet and garages:** vehicles pull out of garages (with deadheading), and garage capacity caps
  the fleet. Maintenance spending sets breakdown rates, and vehicles age.
- **Weather:**
  - Snowfall cuts speeds and lengthens dwell times.
  - Extreme cold raises breakdowns.
  - Plowing priority for bus routes and stops is a lever you share with city operations.
- **Rail reliability** depends on the procurement model, the testing and commissioning time, the
  maintenance budget and winter-readiness spending. This captures the general lessons of
  real-world LRT projects without scripting real events.
- **Accessibility failures:** elevator and escalator outages, uncleared stop pads after snow and
  ramp failures. These hit opinion hard among the riders they affect and push trips onto
  para-transit.

### 4.6 Individual riders (the sample)

- Each day you watch, about **5,000–20,000 agents** are sampled from the aggregate flows. They are
  animated walking, waiting, boarding and transferring.
- **Follow a rider:** a fictional persona card showing their journey, the times and how they feel.
  Their daily diary feeds the opinion explanation. For example: *"Amira waited 18 min at −24 °C and
  missed her transfer."*
- **Starter personas:**
  - Amira: a uOttawa student in Sandy Hill.
  - Gérald: a retiree in Aylmer.
  - Priya: a night-shift nurse.
  - Sam: a wheelchair user in Vanier.
  - Marc: a public servant commuting from Orléans to Tunney's Pasture.
  - Lise: lives in Manotick, no car.

### 4.7 Determinism and performance targets

- A seeded RNG and a fixed timestep mean **the same save always gives the same result**. That is
  essential for tests, bug reports and replays.
- **Targets on a mid-range laptop:**
  - A full evaluation takes under 15 seconds.
  - Rendering holds 60 fps with 2,000 vehicles and 10,000 agents visible.

---

## 5. Network design tools

- **Route drawing:** click waypoints and the route follows the real street graph. Drag to reshape.
  Supports branches, patterns, short-turns and express or limited-stop variants.
- **Stops:** placed manually or auto-suggested from spacing rules. Each stop gets amenities: a pole,
  a shelter, a heated shelter, a real-time sign, an accessible boarding pad, or bike parking.
- **Service planning:** for each route you set:
  - frequency by period
  - span of service
  - vehicle type: 40-ft, articulated, double-decker, battery-electric
  - timed transfers
  - auto-generated timetables.
- **Infrastructure palette** (every item has a cost, a build time and an opinion profile):

| Group | Items |
|---|---|
| **Bus** | Bus lanes, queue jumps, transit signal priority, Transitway segments and stations, park & ride lots, garages. |
| **Rail** | LRT (surface, trench, tunnel or elevated), stations (side or centre platform, step-free, cross-platform transfers), maintenance and storage facilities, signalling level. Commuter rail on existing corridors needs track-sharing agreements with freight and VIA. Either a new river crossing or reuse of the Prince of Wales Bridge. |
| **On-demand and para-transit** | Draw demand-responsive zones (rural and late night), set vehicles and hours. Para-transit fleet, booking capacity and eligibility policy. |
| **Unusual** | **Ferries** run only between ice-out and freeze-up. **Gondolas** suit river and escarpment crossings and are an opinion wildcard. **Streetcars** carry a nostalgia bonus: Ottawa's own streetcars ran until 1959. |

- **Live feedback while editing:**
  - change in coverage
  - an isochrone preview
  - estimated riders
  - cost per year
  - crowding warnings
  - **who loses service** (which riders, which wards)
  - councillor sentiment.
- **Service changes** take effect on the next scheduled service-change date. Changing service
  immediately costs more and risks a public backlash.
- **Assist tools:** "Suggest a frequent grid", "Fix crowding on this route", "Auto-timetable" and
  "Show me unserved demand".

---

## 6. Money

| Revenues | Costs |
|---|---|
| Fares (base, concession, passes, U-Pass deals, low-income pass) | Operations: cost per vehicle-hour by mode |
| Transit levy on property tax (urban and rural areas, set by council) | Para-transit: cost per trip |
| Provincial and federal gas-tax transfers | Maintenance, energy (diesel prices fluctuate) |
| Capital grant programs (open in windows, with cost-share rules and readiness requirements) | Labour (set by contracts) |
| Advertising, park & ride parking fees | Capital: cost per km by mode and alignment, stations, vehicles, garages |
| Development charges, land value capture near stations (late-game policy) | Debt service; **state-of-good-repair backlog** (underfunding leads to declining reliability) |

- **Procurement choices for big projects:** design–bid–build, design–build, or a public–private
  partnership (DBFM).
  - Each has its own distribution of cost, schedule and reliability risk.
  - A P3 is cheaper up front and transfers some risk, but you lose flexibility.
  - **Spending on studies narrows the uncertainty.**
- **Fare policy levers:**
  - the base fare
  - concessions for seniors, youth and students
  - monthly passes
  - U-Pass, negotiated institution by institution
  - a low-income pass
  - fare capping
  - the transfer window
  - cross-river integration, which needs an agreement with STO
  - fare technology, upgraded as projects: paper, then smart card, then open payment.
- **Calibration anchors:**
  - Ottawa's 2010–2011 transit budget documents.
  - Public capital-cost reports, e.g. Stage 1 LRT at about $2.1B for 12.5 km including a
    2.5 km tunnel.
  - Unit costs from other Canadian projects, for comparison.

---

## 7. Politics and public opinion (full civic layer)

### 7.1 Actors

| Actor | Role in the game |
|---|---|
| **Ottawa council:** mayor plus 23 ward councillors (2010 boundaries; redistributions happen later as events) | Votes on budgets, levy, big projects and the urban boundary. Councillors are **fictional people** with traits: priorities (transit, roads, taxes, rural, heritage, environment), ideology, ambition, their relationship with you and how sensitive they are to their ward's opinion. |
| **Transit Commission** (councillors plus citizen commissioners, chaired by you) | Votes first on transit items and recommends them to council. |
| **Mayor (AI)** | Platform shaped by each election. Can champion your plans or obstruct them. |
| **Gatineau council and STO board (AI)** | A separate agency with its own agenda: sometimes a partner, sometimes an obstacle. It negotiates, trades favours, and can act unilaterally. Elections in November shift its priorities. |
| **Ontario, Quebec and the federal government** | **Generated, fictional governments** (no real parties) whose priorities shift after their own elections. They open funding programs with conditions attached. |
| **NCC** | Controls federal lands, parkways, Greenbelt approvals and bridge issues. Can block an alignment or demand changes to it. |
| **Transit union** (fictional local) | Contract talks every 3–4 years. |
| **Stakeholders** | Business improvement areas, universities, community associations, an accessibility advisory committee, cycling and transit advocates, and the road lobby. |
| **Media** | Fictional English and French outlets and a social feed. |

### 7.2 Opinion model

- **Where opinion is stored:** in each zone and segment, on the same grid as demand. It has several
  axes: **service satisfaction**, **value for money** (taxes and fares), **trust in leadership**,
  and **support for each project**.
- **Riders** form opinions from their actual simulated trips: waits, crowding, reliability,
  transfers, pass-ups, accessibility failures and **cold waits**.
- **Non-riders** form opinions from:
  - taxes
  - traffic effects, such as bus lanes taking car lanes
  - construction disruption
  - the tone of the media
  - neighbourhood effects: NIMBY and YIMBY reactions to stations, garages and elevated lines.
- **Memory and decay:** bad experiences fade slowly. Late or broken promises carry a penalty of
  their own.
- **Opinion maps:** a soft colour wash by ward or zone. Drill down to see the reasons.

### 7.3 Council mechanics

- **Agenda items** need votes. Before a vote you see a **whip count**: each councillor's likely
  yes, no or undecided, with their reasons.
- **Persuasion tools:**
  - spend Political Capital
  - amend the proposal: add a stop in their ward, phase it, cut its cost
  - run a public consultation (costs time and money; builds support and surfaces problems early)
  - commission studies (better staff reports)
  - run a media campaign.
- **Political Capital** is earned from high approval, ribbon-cuttings delivered on time and keeping
  promises. You spend it to win contentious votes.
- **Soft consequences of low support:**
  - imposed budget cuts
  - paused or cancelled projects
  - council directions that override your plans ("restore route X")
  - commission seats reshuffled
  - a hostile mayor.
- Every crisis offers a path back. For example, a high-profile failure can open a funding window.

### 7.4 Elections

- Every four years, candidates are generated with platforms that react to the public mood:
  pro-transit, low-tax, roads-first or rural champion.
- Ward results are computed from opinion, incumbency and a random swing.
- **Election night** is a showcase screen, with the ward map filling in as results arrive.
- The new council's makeup sets how hard the next term will be.

### 7.5 Labour

- Contract talks are a mini-game over wages, scheduling rules and the share of part-time work.
- If talks fail, there is a strike risk. At the start of the game this is especially sensitive
  because of the public's memory of the 2008–09 strike.

### 7.6 Media

- A bilingual headline generator, driven by simulation events and their tone, produces:
  - a monthly front page
  - a social feed
  - town halls.
- You can respond, for example with a press conference, which costs time and Political Capital.
- Example headline: *"Riders shiver as the 95 bunches again"*.

---

## 8. Goals and scoring: the Capital Scorecard

Five headline indicators, each grounded in real-world planning measures:

| Indicator | Measures |
|---|---|
| **1. Coverage** | % of urban residents within a 400 m walk of a stop; % within walking distance of **frequent** service (every 15 min or better, all day); % within 800 m of rapid transit; % of rural village residents with any service, including on-demand. |
| **2. Accessibility** | **(a) Universal design:** % of stations that are step-free, % of fleet that is accessible, elevator uptime, winter clearing of stops, para-transit trip-denial rate, audio and visual announcements, and milestones under Ontario's AODA (whose goal is an accessible Ontario by 2025). **(b) Access to opportunity:** average jobs reachable within 45 minutes by transit in the AM peak, weighted for equity (low-income, seniors, disability). |
| **3. Cost** | Cost-recovery ratio, cost per boarding, subsidy per rider, levy growth against inflation, debt ratio, state-of-good-repair backlog. |
| **4. Ridership** | Annual boardings; regional transit mode share (all day and AM peak); transit share of river crossings and of the downtown cordon. |
| **5. Public support** | Approval overall and by ward and segment, council support count, trust. |

- **Term goals:** each council term sets goals, partly from council and the mayor and partly from
  your own campaign promises. For example: *"Raise transit mode share to 16% by 2014 with levy
  growth ≤ 2.5% a year."*
- **End-of-term report card**, achievements, and a **2030 legacy score** presented as a newspaper
  retrospective.

**Scenarios** are short, focused challenges alongside the campaign:

| Scenario | Challenge |
|---|---|
| *The Bus Wall* | Fix downtown capacity. |
| *Across the River* | Integrate with STO. |
| *Rural Reach* | Serve the rural wards. |
| *Deep Freeze* | Get through a brutal winter. |
| *Access for All by 2025* | Meet the accessibility deadline. |
| *Austerity* | Deliver more with 10% less. |
| *Blank Slate* | Sandbox. |

---

## 9. Visual and audio design: an elegant 2.5D "living map"

> **Superseded in detail by [`VISUAL_DESIGN.md`](VISUAL_DESIGN.md)**, which has the final palettes,
> symbology and HUD layout, plus prototype screenshots. This section remains as the summary.

### 9.1 Art direction

- **Living cartography:** it should feel like a beautifully printed city map that has come alive.
  Hierarchy comes from line weight and space, not from noise.
- **Draft palette, day:**
  - Land: "Limestone" `#F3EEE4`
  - Water: "Rideau" `#9CC3D5`
  - Parks and Greenbelt: "Greenbelt" `#C9DDB8`
  - Buildings: "Granite" `#B9B3A8`
  - Roads: warm greys, distinguished by width.
- **Draft palette, night:**
  - Land: "Canal Night" `#0F1B2D`
  - Water: `#14304A`
  - Streets glow warm.
  - Building windows light up in proportion to density.
- **Transit is the hero:**
  - Routes use a colour-blind-safe set of 12 colours.
  - Rapid lines are thick with a soft glow; frequent routes are medium; local routes are thin and
    muted until selected.
  - **Line bundling:** routes sharing a corridor run as parallel offset ribbons, the way a
    well-drawn transit map shows them.
- **Typography:** an open-source humanist sans (e.g. Inter or Source Sans 3). Place names appear in
  their official forms, in both languages.
- **Camera:** top-down by default. You can tilt up to about 60° and zoom into neighbourhoods, where
  buildings extrude with soft ambient occlusion and shadows. Terrain hillshading picks out the
  escarpment and the Gatineau Hills.

### 9.2 Signature moments

These are what make the game pleasing to watch:

1. **The network wakes up.** At 4:30 am the garages light up and vehicles stream out along their
   routes like threads.
2. **Geographic ↔ schematic morph.** The real map animates smoothly into an auto-generated
   octilinear transit diagram and back again.
3. **Isochrone bloom.** Click anywhere and coloured rings bloom outward, showing how far you can get
   in 15, 30, 45 and 60 minutes.
4. **Flow ribbons.** Line width shows passenger load and pulses with the peaks; crowded segments
   warm in colour.
5. **Seasons:**
   - The first snowfall dusts the map.
   - The canal freezes into the Skateway.
   - Tulips appear in May.
   - Gatineau Park turns red and gold in autumn.
   - Crowds pulse at Winterlude and on Canada Day.
6. **Opening day.** A fly-through camera follows the first train along a new line, leaving a wake of
   new riders.
7. **Civic theatre:**
   - the monthly front page
   - election night, with the ward map filling in
   - the council chamber, where seats light up as votes are cast.

### 9.3 UI

- **Main screens:** Map, Route editor, Line and stop inspector, Follow a rider, Overlays, Budget,
  Council and votes, Newsroom, Scorecard, Timeline, and Settings.
- **Behaviour:** minimal chrome, panels that slide in, keyboard shortcuts, and tooltips with a
  "Why?" drill-down.

### 9.4 Accessibility of the game itself

The game should practise what it preaches:

- colour-blind-safe palettes, plus patterns
- scalable UI text
- full keyboard play
- a reduced-motion mode
- panels labelled for screen readers
- captions for audio
- adjustable speed, with no time-pressured inputs.

### 9.5 Audio

- An ambient soundscape that changes with zoom and time of day: city hum, the river, winter wind.
- Soft UI sounds and gentle music, using CC0/CC-BY or commissioned assets.
- All audio is optional.

### 9.6 Names and branding

- **Real:** geography, place names, ward names, and **agency and service names** (OC Transpo, STO,
  Para Transpo, Transitway, O-Train). Route numbers can match 2010. Line colours follow the real
  ones.
- **Fictional:** politicians, journalists, media outlets and riders.
- **No real logos** or official artwork. If the game is ever released publicly or commercially, the
  use of agency names should be reviewed first (§13).

---

## 10. Technical architecture

### 10.1 Stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** for the client and simulation; **Python** for the offline data pipeline. | Typed and easy for Claude to maintain. Python has the best geodata tooling. |
| Build | Vite with pnpm workspaces. | Fast and simple. |
| Map rendering | **MapLibre GL JS**: a custom style, 3D building extrusions, terrain. | Open source, vector tiles, 2.5D out of the box. |
| Overlays and animation | **deck.gl**, interleaved with MapLibre: TripsLayer, PathLayer, ScatterplotLayer, H3HexagonLayer, ArcLayer. | GPU-instanced, so it handles thousands of moving vehicles; vehicles are correctly hidden behind buildings. |
| Tiles | Planetiler or tippecanoe producing **PMTiles** (a single static file). | No tile server is needed, and hosting is cheap. |
| UI | React + Zustand. | A mature ecosystem, and deck.gl has React bindings. |
| Simulation | A pure TypeScript package running in **Web Workers**. Moved to Rust/WASM only if profiling demands it. | Runs and tests headless in Node. |
| Game data | Compact typed-array binaries (or FlatBuffers) for zones, graphs and timetables; JSON for config. | Fast loading, small downloads. |
| Saves | IndexedDB, plus compressed export/import. An event-sourced command log provides undo/redo. | Deterministic replays. |
| i18n | i18next, English and French. | Bilingual from day one. |
| Tests | Vitest for simulation and calibration tests; Playwright for UI smoke tests and screenshot comparisons. | Catch regressions in both numbers and visuals. |
| Hosting | Static hosting (Cloudflare Pages or Netlify, both of which can set the COOP/COEP headers needed for SharedArrayBuffer). PMTiles go on object storage. | Cheap and fast. |
| Devices | One responsive app with **desktop, tablet and phone layouts**; touch, Apple Pencil, keyboard and trackpad input; an installable **PWA** with offline tiles and saves. Capacitor is an option later for the App Store. | iPad and phone are first-class targets (VISUAL_DESIGN §12). |
| CI | GitHub Actions: typecheck, lint, test, build and a preview deploy. | |

### 10.2 Repository layout

```
public--transit/
├─ apps/web/               React + MapLibre + deck.gl client
│  ├─ src/map/             style, layers, camera, seasons, day/night
│  ├─ src/ui/              panels, editor, council, newsroom, scorecard
│  └─ src/workers/         worker entry points (wrap packages/sim)
├─ packages/sim/           pure-TS simulation core (no DOM)
│  ├─ network/             stops, routes, patterns, timetables
│  ├─ demand/              generation, destination choice, mode choice
│  ├─ assign/              RAPTOR, skims, capacity-constrained assignment
│  ├─ ops/                 vehicle movement, dwell, bunching, fleet, weather
│  ├─ growth/              land use, developer proposals
│  ├─ civic/               opinion, council, elections, funding, labour, media
│  └─ economy/             budget, fares, costs, procurement
├─ packages/shared/        types, schemas, i18n strings, constants
├─ pipeline/               Python data pipeline (uv), one step per script
├─ data/                   raw/ and build/ (gitignored); small fixtures committed
└─ docs/                   this plan, decisions log, data notes
```

### 10.3 Runtime architecture

```
 Main thread                                   Web Workers
┌───────────────────────────────┐   ┌──────────────────────────────────┐
│ React UI panels               │   │ Ops worker: vehicles, dwell,     │
│ MapLibre + deck.gl rendering  │◄──┤  bunching → positions via        │
│                               │   │  SharedArrayBuffer (zero-copy)   │
└──────┬───────────────▲────────┘   ├──────────────────────────────────┤
       │ commands      │ snapshots  │ Demand pool (N workers): skims,  │
       ▼               │            │  mode choice, assignment         │
  Game state store (event-sourced)  ├──────────────────────────────────┤
  seeded RNG · fixed timestep ─────►│ Civic worker: opinion, council,  │
                                    │  elections, events, headlines    │
                                    └──────────────────────────────────┘
```

### 10.4 Core data model (sketch)

```ts
type ZoneId = number; type StopId = number; type RouteId = number;

interface Zone { id: ZoneId; ward: number; district: number; centroid: [number, number];
  households: Float32Array /* per segment */; jobs: Float32Array /* per sector */; }

interface Stop { id: StopId; pos: [number, number]; amenities: AmenityFlags;
  stepFree: boolean; serves: RouteId[]; }

interface Route { id: RouteId; mode: Mode; name: string; color: string;
  patterns: Pattern[]; service: Record<Period, { headwayMin: number; vehicleType: VehicleType }>; }

interface Project { id: string; kind: ProjectKind; geometry: GeoJSON.Geometry;
  phase: 'proposed'|'study'|'approved'|'procuring'|'building'|'open';
  cost: Distribution; schedule: Distribution; procurement: Procurement; }

interface Councillor { id: number; ward: number; name: string /* fictional */;
  traits: Traits; stanceByIssue: Record<Issue, number>; relationship: number; }
```

---

## 11. Data plan: getting an exact 2010

> **Status (M1, November 2026):** the base map is built. Full OSM history isn't reachable from the
> build environment, so the 2010 state is reconstructed differently from the table below:
> **today's Overture data, with each feature dated by the ID of its oldest OSM element**
> (calibrated: way ID 84,830,956 ≈ 1 Dec 2010). Post-2010 subdivisions are detected and removed,
> and curated changes are applied. Terrain comes from **NRCan CDEM**. Details, numbers and
> limits are in [`pipeline/README.md`](../pipeline/README.md). The census, survey, GTFS and ward
> rows below are still to do (M2–M3).

### 11.1 Sources

| Layer | Source | Licence | How the 2010 state is obtained |
|---|---|---|---|
| Roads, rail, water, land use | OpenStreetMap **full-history** extract | ODbL (attribution required) | Snapshot at 2010-12-01 with `osmium time-filter`. Gaps in 2010 mapping are filled from current OSM, minus a curated "built after 2010" list (Confederation Line, Rapibus, the Vimy Memorial Bridge, Highway 417 widenings, new subdivisions). |
| Building footprints and heights | City of Ottawa and Ville de Gatineau open data; StatCan Open Database of Buildings; heights from NRCan HRDEM (surface minus terrain) | Municipal open licences, OGL-Canada | Current footprints, with post-2010 buildings removed using OSM history and zones that were empty in 2011. Buildings are Tier C (decorative at high zoom). |
| Terrain | NRCan CDEM / HRDEM | OGL-Canada | Static, used for hillshade and the terrain mesh. |
| Population and demographics | 2011 Census at dissemination-area level, plus the 2011 NHS (with the 2006 long-form as a fallback) | StatCan Open Licence | Used directly for the base year. |
| Jobs | Census place-of-work data; City of Ottawa employment survey summaries | StatCan, City | Allocated to zones. |
| Travel behaviour | **2011 TRANS NCR Origin–Destination Survey** (published reports and district tables; request microdata if possible); Quebec MTQ's 2005–2011 Outaouais comparison | Per publisher | Calibration targets: about 1.23M people in the survey area and a 13.5% transit mode share in 2011. |
| 2010 OC Transpo network | Historical GTFS: OC Transpo has published GTFS since 2008. Archived copies may survive in the retired **GTFS Data Exchange** archive (available for research on request), or on request from OC Transpo's developer contact. | Per feed licence | Import directly if found. Otherwise reconstruct from Wayback Machine captures of 2010 maps and timetables. |
| 2010 STO network | Transitland feed archive (versions from later years); Wayback Machine captures of 2010 STO maps and schedules | Per feed licence | Likely needs reconstruction: trunk routes exact, minor routes approximated. |
| Wards | City of Ottawa 2010 ward boundaries (23 wards); Gatineau electoral districts | Municipal open data | Used directly. |
| Budgets and costs | City of Ottawa 2010–2011 transit budget documents and Transit Commission reports; public project cost reports | Public documents | Calibrate unit costs and the opening budget. |

### 11.2 Pipeline (Python, reproducible with one command per step)

1. `fetch` downloads raw data into `data/raw/` with checksums.
2. `clip` cuts everything to the Ottawa + Gatineau region polygon.
3. `snapshot` produces the OSM state at 2010-12-01 and applies the "built after 2010" list.
4. `roads` builds the routable road graph with speeds by class and a congestion baseline.
5. `zones` builds dissemination-area zones, district and ward lookups, and the H3 index.
6. `population` builds the synthetic population (IPF) and allocates jobs.
7. `network2010` imports GTFS (or reconstructs it) into the internal network format.
8. `calibrate` fits the demand model and reports against the targets.
9. `tiles` generates the basemap PMTiles (land, water, roads, buildings, labels in EN/FR).
10. `package` writes compact binary game data and the attribution file.
11. `validate` runs automated checks: connectivity, coverage, and the calibration report.

### 11.3 Data requests to send early (they have lead times)

- **2010 OC Transpo GTFS:** ask the GTFS Data Exchange archive maintainer, and OC Transpo's
  developer contact (listed on their developer page).
- **TRANS 2011 origin–destination survey:** district-level origin–destination matrices and mode
  shares, and microdata access if possible.
- **Wayback Machine:** capture the 2010 OC Transpo and STO system maps and schedules now, as a
  fallback.
- **Fallback plan if 2010 GTFS cannot be found:**
  - Reconstruct the Transitway, the O-Train and the frequent routes exactly.
  - Approximate minor routes from archived maps.
  - Mark approximated routes in-game, with a note in the "Why?" panel.

### 11.4 Calibration targets (2011 base year)

| Measure | Target |
|---|---|
| Population by dissemination area | Exact (it is an input). |
| Jobs by district | ±5% |
| Regional transit mode share (all trips) | 13.5% ± 0.5 points |
| AM-peak transit share by district | ±2 points |
| River-crossing and Greenbelt screenlines | ±10% |
| OC Transpo and STO annual boardings | ±5% of published figures |

---

## 12. Roadmap

The order is chosen so that **something beautiful appears early**, then **something playable**,
then depth. During M2–M4 the work is limited to a **core slice** (inside the Greenbelt plus Hull)
to keep iteration fast; it expands to the full region afterwards.

| # | Milestone | Includes | Done when | Size |
|---|---|---|---|---|
| M0 ✅ | **Foundations** | Monorepo (pnpm), Vite/React app, sim package, Python pipeline (uv), CI, attribution | CI is green; the app builds | S |
| M1 ✅ | **The Map** | 2010 basemap tiles, custom day/night style, terrain, 3D buildings, seasons toggle, EN/FR labels; the responsive shell (desktop, iPad, phone layouts; PWA manifest) | You'd happily leave it open as a screensaver, on a laptop, an iPad and a phone | M |
| M2 ✅ | **The 2010 network moves** | 2010 OC Transpo network (Transitway, O-Train, top routes) imported; vehicles animated from timetables; stop and line inspectors | A morning peak plays back on the map | M |
| M3 🔶 | **People ride** | Zones, synthetic population, demand model, RAPTOR skims, assignment, base-year calibration report | Ridership numbers appear and the 2011 targets are met within tolerance | L |
| M4 🔶 | **Design tools → FIRST PLAYABLE** | Draw and edit routes, stops and frequencies (mouse, touch and Apple Pencil); live preview; isochrones; coverage and Scorecard v1 | You can redesign the network and see riders respond, on any device | L |
| M5 🔶 | **Money and fleet** | Budget, fares, operating costs, garages, fleet ordering, maintenance, service-change calendar | You can run out of money in an interesting way | M |
| M6 🔶 | **Opinion and media** | Opinion grid, rider diaries, "Follow a rider", headline generator, opinion maps | The public's reaction is visible and explainable | M |
| M7 🔶 | **Council, elections and partners** | Councillors, whip counts, votes, Political Capital, elections, STO AI, funders, NCC, labour | A full four-year term plays out with soft consequences | L |
| M8 | **Big projects** | LRT, commuter rail, Transitway segments, river crossings; procurement, construction disruption, opening day | You can build a rapid-transit line from proposal to opening | L |
| M9 | **Growth** | Land-use allocation, developer proposals, TOD, urban boundary debates, ward redistribution | The 2030 city looks different depending on how you played | M |
| M10 | **Campaign and content** | Tutorial, term goals, scenarios, achievements, 2030 legacy retrospective, sandbox options | A complete campaign from 2010 to 2030 | M |
| M11 | **Polish** | Schematic morph, seasonal effects, signature moments, audio, accessibility pass, French pass, performance (including a mobile battery and memory budget), offline PWA | The game feels finished and lovely, and plays well on a phone | L |

**How we'll work (solo + Claude):**

- Each milestone is broken into small, reviewable tasks. Claude implements them; you playtest and
  steer.
- `docs/decisions.md` records every design call.
- Each change comes with screenshots, so visual progress is easy to follow.
- After each milestone there is a short "is it fun yet?" check before moving on.

---

## 13. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| 2010 GTFS for OC Transpo or STO can't be found | The starting network is less exact | Ask early (§11.3); reconstruct from archived maps; mark approximated routes. |
| OD survey microdata isn't available | Weaker calibration | Use published district tables, census commuting flows and screenline counts. |
| Browser performance with about 1.2M people | Laggy or slow evaluation | Aggregate demand with sampled agents; workers; fast-preview sampling; WASM only if needed. |
| Scope creep, especially in the full civic layer | It never ships | Ship v1 of each system thin and data-driven (events and actors as JSON); roadmap gates. |
| Realism makes it unfun | Players bounce off | Difficulty presets, generous "Planner" mode, strong feedback and "Why?" explanations. |
| Real people, trademarks, defamation | Legal or ethical problems if it goes public | Fictional politicians and media. Real agency names are used by decision, but no logos or official artwork. Review the name use before any public or commercial release. |
| Mobile performance and memory (iOS Safari) | Stutter, crashes, battery drain on phones | Vector tiles with level-of-detail, a device-pixel-ratio cap, draw only on-screen vehicles, a 30 fps battery-saver, compact typed arrays, and per-device-class agent caps (VISUAL_DESIGN §12.4). |
| OpenStreetMap coverage in 2010 is patchy | Missing streets or buildings | Hybrid snapshot: current data minus a curated post-2010 list, plus manual review of the core. |
| Licence compliance | Takedown risk | `ATTRIBUTION.md`, an in-game credits screen, ODbL share-alike handled for derived data. |

---

## 14. Open questions (with my recommended defaults)

| # | Question | Recommended default |
|---|---|---|
| 1 | ~~Gatineau control~~ | **Decided:** STO runs separately, collaborating but with its own political agenda. |
| 2 | **Start date:** 1 December 2010 (new council term, budget first) or 1 January 2010 (the October 2010 election early on)? | 1 December 2010. |
| 3 | ~~Names~~ | **Decided:** real agency names (OC Transpo, STO), no logos. |
| 4 | **Public release:** will this eventually be online for others to play? This affects hosting, licensing and names. | Assume yes, eventually, and design for it from the start. |
| 5 | ~~Target hardware~~ | **Decided:** desktop, iPad and phone, all first-class. |
| 6 | **Campaign end:** 2030 (five terms), 2026 (the present) or open-ended? | 2030, then endless mode. |
| 7 | ~~Title~~ | **Decided:** Ottawa Transit Commissioner (OTC). |
| 8 | **Pandemic-style demand shock:** include it as an optional random event? | Optional, off by default. |

---

## 15. Immediate next steps

1. ✅ **Graphics direction locked** ([`VISUAL_DESIGN.md`](VISUAL_DESIGN.md)).
2. ✅ **M0:** the project skeleton and CI.
3. ✅ **M1:** the 2010 base map ([screenshots](screenshots/m1/)). Run it with `pnpm dev` after
   `uv run otc-pipeline all`.
4. ✅ **M2:** the whole network moves ([screenshots](screenshots/m2/)). That's 226 routes, about
   12,400 weekday trips, 6,400 stops and ~880 buses at the peak. Accuracy is "right enough for a
   game", by design; each route's provenance says where it comes from.
   - **OC Transpo:** its own timetable. The *Archive 2010 GTFS* workflow found no 2010 feed in the
     Internet Archive. The closest is August 2011, the network just before the September 2011
     restructuring. Its 17 August weekday stands in for 1 December 2010: 148 routes, 8,952 trips,
     all stops.
   - **STO, and the few OC Transpo routes missing in August 2011:** approximated. Each route goes
     between the places the November 2010 route tables list, with service typical of its fare
     class. STO's earliest preserved feed (2016) post-dates the Rapibus, so it isn't used.
   - **Without the feed** (`network --no-gtfs`): the Transitway routes follow dated Wikipedia
     revisions and everything else is approximated.
5. 🔶 **M3 (v1 done):** people ride ([calibration report](calibration/2011.md)).
   - **Zones and people:** 1,360 H3 zones. Residents and jobs are placed from the 2010 buildings,
     scaled to the 2011 census (`otc-pipeline zones`).
   - **Travel times:** RAPTOR transit skims and car times from the road graph.
   - **Demand:** trip generation, logit destination and mode choice, and calibration.
   - **Assignment:** all-or-nothing on RAPTOR journeys (`pnpm --filter @otc/sim demand`, about
     45 s).
   - **Result:** 2.87 million weekday trips, 13.7% by transit, about 580,000 boardings. Every
     calibration row passes, though several targets are still estimates.
   - **In the game:** the Ridership panel, the Riders map view, and boardings on routes and stops.
   - **Still to do:**
     - census dissemination areas and the 2011 OD survey's district tables, instead of estimates;
     - capacity-constrained assignment (crowding and pass-ups);
     - more periods (early, PM, evening);
     - screenline checks;
     - running the model in Web Workers, ready for M4's live editing.
6. 🔶 **M4 (v1, first playable):** the design tools ([screenshots](screenshots/m4/)).
   - **Plan mode** pauses the clock and fades the network back.
   - **Edits:**
     - change any route's headways in four periods, or take it out of service;
     - draw a new route by tapping points. It follows the 2010 streets (`graph-2010.bin`, from the
       `network` step), keeps off highways, gets stops every ~400 m named after cross streets, and
       reuses existing stops it passes.
   - **The edited network runs live** on the map, and the draft is kept in the browser.
   - **Travel times:** an instant travel-time bloom from any point (RAPTOR, 8:00 departure).
   - **Evaluate** reruns the calibrated demand model on the draft in a Web Worker: about 15 s, with
     the 2010 baseline computed in the background when Plan mode opens.
   - **Scorecard v1:** boardings, transit share, coverage within 400 m (any service and frequent
     service), jobs within 45 min, operating cost, cost per boarding and peak buses, each against
     2010, plus transit share by district and riders on new routes.
   - **Still to do:**
     - drag to reshape routes, and branches and short-turns;
     - stop amenities and vehicle types;
     - a sub-second "fast preview";
     - who loses service (by ward), crowding warnings, and an "unserved demand" assist;
     - infrastructure (bus lanes, Transitway segments, rail);
     - service-change dates and costs (M5).
7. 🔶 **M5 (v1):** money and fleet ([screenshots](screenshots/m5/)).
   - **The calendar** starts at 00:01 on Wednesday 1 December 2010 and runs on the game clock, which
     crosses midnight (late trips run on the timetable's 24:00+ times). Speeds: pause, real time,
     1 min/s, 15 min/s, 2 h/s and 1 day/s; vehicles are hidden at 1 day/s. Decisions pause the
     game. The campaign and the time of day are saved in the browser.
   - **The look follows the calendar:** the season from the month (snow from December to March) and
     night from Ottawa's sunrise and sunset (with daylight saving time). There are no season or
     day/night buttons any more; `?season=` and `?time=` still pin the look for screenshots.
   - **Riders day by day:** each day's OC Transpo boardings = the weekday level × season, growth,
     fares and reliability × the day of the week (Saturday 0.58, Sunday 0.42). Ontario holidays run
     Sunday service, and the Christmas break is quieter. Saturdays run 60% of weekday trips and
     Sundays 45%. The Ridership panel charts the last twelve weeks with service changes marked, and
     the top bar shows yesterday's riders against the same day last week. Monthly fares are the
     sum of the days.
   - **Riders take time to respond.** A scheduled plan is measured by the demand model when it is
     scheduled. From the change date, riders move towards the new level over weeks when service
     improves (time constant 21 days) and within days when it is cut (6 days). A removed route
     carries no one from the first day. The routes a change touches, and the four others whose
     riders move most, are followed day by day.
   - **The books are kept month by month:**
     - fares, from the demand model's ridership × season × growth × fare elasticity × reliability;
     - the levy, gas tax and other revenue;
     - operations, at bus-hours × cost per hour with inflation;
     - maintenance, Para Transpo, fixed costs and debt service;
     - the operating and capital reserves.
   - **The fleet** is the sourced December 2010 fleet: 1,048 buses by model and year. The 2011
     D60LFR order replaces the high-floor buses as it arrives. Buses age and retire. Orders arrive
     after their lead time if a garage has room, and garages can be built. A peak requirement above
     the fleet means missed trips.
   - **Plans** from Plan mode are scheduled for the next service change (late April, late June, the
     Sunday before Labour Day, mid-December).
   - **Decisions:**
     - each autumn's budget (levy, fares, maintenance), with a live 12-month projection;
     - deficits: raise the levy, cut service, defer maintenance (backlog, breakdowns) or borrow;
     - fleet shortfalls: order, cut, or run short.
   - **Testing it:** `pnpm --filter @otc/sim economy-demo` plays five years in Node. With a frozen
     levy, deficits start in 2013 and borrowing snowballs.
   - **Sources:** in `packages/shared/src/economy.ts`. The fleet, garages and fares are from 2010
     sources; the budget lines are labelled estimates.
   - **Still to do:** fare policy detail (passes, U-Pass, concessions), labour contracts, fuel price
     shocks, capital grants, difficulty presets, council votes on the budget (M7), costs for
     changing service between service-change dates, real Saturday and Sunday timetables, and
     weather (snowstorms) in the daily riders.
8. 🔶 **M6 (v1):** opinion and media ([screenshots](screenshots/m6/)).
   - **Opinion lives in each zone** (1,360 hexagons, Ottawa residents count towards approval) on
     three axes: service, value for money and trust. Each day it moves towards a target made of
     named reasons, so the "Why?" panel can show every point:
     - service: how often buses come where people live; jobs within 45 minutes and waits against
       what people are used to (expectations catch up over about five months); missed trips;
       crowding (more riders per bus-hour than in 2010); cold waits and storm delays (fading over
       a week or two); service cuts;
     - value for money: fares and the levy against what people are used to paying;
     - trust: the memory of the 2008–09 strike (fading over years), events (new routes, removed
       routes, promises kept, fare and tax hikes, deficits, new buses; fading over months) and how
       riding feels.
     Opinion falls about twice as fast as it rises. Approval starts near 48%.
   - **Each zone's level of service** comes from the demand model's skims (jobs within 45 minutes
     by transit at the peak, and the average wait), measured with every scheduled plan.
   - **Weather:** deterministic Ottawa days from 1981–2010 normals, with spells, storm systems
     and deep cold. Storms keep some riders home and slow buses; the temperature shows by the clock.
   - **Six riders to follow** (Amira, Gérald, Priya, Sam, Marc, Lise), fictional, with real
     door-to-door journeys on the network in operation (RAPTOR). Their diaries record cold waits,
     storms, missed trips, high-floor buses Sam can't board (until the new buses replace them),
     Lise's missing midday bus in Manotick, and trips made better or worse by a service change.
     Follow one to see their path and their position on the map.
   - **The press:** a monthly front page from *The Rideau Ledger* / *Le Fil de l'Outaouais*
     (fictional), stories ranked by news value (old news counts for less), and a social feed:
     the riders' diaries, the weather, service changes, and residents giving their main reason.
   - **Opinion map:** the Opinion view washes Ottawa's zones from disapprove (warm) to approve
     (cool), by approval or by axis; tap a zone for its reasons.
   - **Where the load is** (added at your request): the Riders view shows peak crowding. Each
     stop-to-stop stretch carries its morning peak-hour riders (30% of its peak-period riders from
     the assignment) against the places scheduled through it 07:00–09:00 (vehicle capacity by route
     class), summed over all routes; calm < 65% < busy < 90% < crowded < 110% < over capacity.
     Loads are measured for the network in operation with every plan. A panel lists the busiest
     and most crowded stretches, routes under pressure and the busiest stations. Caveat: the
     timetable is August 2011 summer service, so thin suburban routes look more crowded than in
     December.
   - **Testing it:** `pnpm --filter @otc/sim opinion-demo [fare-%] [levy-%]` plays a year in Node.
   - **Still to do:** rider-level crowding and pass-ups, accessibility failures, the real 2010 ward
     boundaries (M7 approximates them), town halls and press conferences, NIMBY/YIMBY reactions to
     projects (M8), and calibrating the starting mood against 2010 polling.
9. 🔶 **M7 (v1):** council, elections and partners ([screenshots](screenshots/m7/)). Your choices:
   only the big items go to a vote, a split council, labour talks in 2011, and STO as a light-touch
   partner with its own agenda.
   - **Wards:** the 23 wards of 2006–2014, approximated over the zones (each zone joins the nearest
     ward centre, weighted so that populations balance). Each ward's mood is its residents' approval.
   - **Council:** a mayor and 23 councillors, all fictional, each with a fiscal stance, a transit
     stance, how much their ward's mood moves them, their relationship with you and a platform. Eight
     sit on the Transit Commission with you as Chair. They start split: 8 lean your way, 9 in the
     middle, 7 fiscal hawks.
   - **What goes to a vote:** the budget and deficit choices (council); service plans that add or
     remove a route (the Commission, with a staff report of each ward's gains and losses);
     frequency changes stay yours; orders of 50 buses or more and garages (council). A vote needs a
     majority of those present; as Chair you vote with your proposal in the Commission.
   - **The whip count:** each member's position comes from a score with named reasons: taxes, fares,
     service, cost, debt, their ward's gains or losses, their ward's mood, their relationship with
     you, the mayor's lead, lobbying, consultation and noise. Undecided is within ±0.35.
   - **Political Capital** starts at 35. Each week it moves with approval (±1.5 at most) and fades 2%
     of the way back towards 35, so it pays to use it. A won vote earns 1; a lost one costs 6 (4 for
     a motion); a delivered plan earns 4. Lobbying a councillor costs 2–12, more the further they
     are from yes. A consultation ($250k) or a study ($150k) puts the vote off a month: a
     consultation sways each councillor with their ward's mood (towards you where people are
     content, away where they aren't); a study reassures the fiscal hawks. Amendments halve the ask.
   - **Soft consequences:** a failed budget is replaced by council's own (the median member's
     levy); unpopular cuts bring motions to restore routes, which become directions applied at the
     next service change; a mayor who cools on you; and, when both capital and approval run low, a
     reshuffled Commission.
   - **Labour:** the fictional Transit Workers' Union, Local 613. The contract ends 31 March 2011 and
     talks open 1 February: up to three rounds over the wage, scheduling rules and the term. A deal
     goes to council for ratification. Failed talks bring a strike vote; a strike stops OC Transpo
     (fares and most costs too) until you meet the union (back in days, at a higher wage), go to
     arbitration (two weeks) or hold out.
   - **Partners:** STO proposes fare integration, shared stops and downtown layovers on its own
     timetable, opens the Rapibus in October 2013 and gets a new agenda after Gatineau's November
     2013 election; turn down its downtown layovers and it goes ahead alone. Ontario offers a third of each new bus if
     fares rise no more than 2.5% a year (2011–2013); the federal program offers $30M toward a
     garage built by June 2013. New routes on NCC parkways need the NCC's approval.
   - **Elections:** Ottawa votes on 27 October 2014. Each ward's result comes from its mood, the
     incumbent and a random swing; open seats bring candidates whose platforms follow the public
     mood. Election night reveals the wards one by one, and the new council takes office on
     1 December.
   - **Testing it:** `pnpm --filter @otc/sim council-demo` plays the 2010–2014 term in Node,
     answering every vote the simple way. Status quo: every budget passes (16–19 votes), the 2011
     contract is ratified, capital settles around 50 and one seat changes in 2014.
     `apps/web/scripts/verify-council.cjs` plays the votes and the talks in the browser.
   - **Still to do:** the real 2010 ward map, council debate scenes, media campaigns and press
     conferences, the urban boundary and big projects (M8), ward redistribution (M9), Gatineau's
     council as a full actor, and term goals (M10).
10. ✅ **Added at your request:** a start screen and riders on board
    ([screenshots](screenshots/start/)).
    - **Start screen:** the living map behind a title card. Continue shows the saved campaign's
      date, time, approval and reserve; New game asks first, then clears this browser's save and
      starts again on 1 December 2010. The logo reopens it during the game. Links with options
      (screenshots, deep links) skip it.
    - **Riders on board:** the vehicle panel shows riders on board now, against seats and room by
      vehicle class (60-ft bus 55 seats / 100, 40-ft 38 / 65, O-Train 135 / 260), and the load
      leaving each coming stop. From the demand model's loads on the network in operation: a route's
      riders between two stops are pooled over its patterns (the assignment spreads them somewhat at
      random) and shared between its trips that run today by time of day and headway. The model
      splits commute trips both ways, so each stretch's commuters ride in the morning where they're
      heading towards jobs (jobs share within about a kilometre of where they get on and off) and in
      the evening otherwise; other trips follow a midday profile, and weekends have no peaks. Scaled
      to the day's riders. Above capacity it shows full: riders left behind.
      `pnpm --filter @otc/sim onboard-demo` prints a few routes through the day.
11. Send the **data requests** in §11.3 as a fallback if no archived GTFS capture exists.
12. Answer the remaining open questions in §14. Defaults will be used where you don't specify.

---

## Sources consulted for this plan

- OC Transpo developer page (GTFS available since 2008, developer contact):
  <https://www.octranspo.com/en/plan-your-trip/travel-tools/developers>
- OC Transpo GTFS on the Mobility Database: <https://mobilitydatabase.org/feeds/gtfs/mdb-2154>
- GTFS Data Exchange shutdown notice (historical feeds available for research):
  <https://github.com/jehiah/gtfs-data-exchange>
- Transitland on the GTFS Data Exchange transition:
  <https://www.transit.land/news/2016/05/16/gtfs-data-exchange>
- 2010 OSM talk-ca thread on OC Transpo GTFS:
  <https://lists.openstreetmap.org/pipermail/talk-ca/2010-April/002562.html>
- STO feed versions on Transitland: <https://www.transit.land/feeds/f-f244-sto>
- Quebec MTQ, Outaouais 2005–2011 O-D comparison (population about 1.23M, transit share 13.5%):
  <https://www.transports.gouv.qc.ca/fr/ministere/Planification-transports/enquetes-origine-destination/Documents/ads-outaouais-2005-2011.pdf>
- City of Ottawa Transportation Master Plan, chapter 2:
  <https://documents.ottawa.ca/sites/default/files/documents/tmp_chapter_2_en.pdf>
- 2011 TRANS Agreement report to Ottawa council:
  <https://app06.ottawa.ca/calendar/ottawa/citycouncil/occ/2011/04-27/trc/03-ACS2011-ICS-PGM-0076%20TRANS%20report.htm>
- 2011 Transit Commission draft budget (2010 actuals):
  <https://app06.ottawa.ca/calendar/ottawa/citycouncil/occ/2011/11-30/tc/UPDATED%20transit_draft_budget.pdf>
