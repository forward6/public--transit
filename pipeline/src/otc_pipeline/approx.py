"""Approximate 2010 routes for the rest of the route catalogue: a complete, playable network.

OTC is a game, so where no route-level 2010 source is available (no GTFS, no route article), each
route of the dated 2010 catalogue (``route_catalogue.json``: number, fare class, termini) becomes a
plausible route. This module writes route definitions in the routes.json format; the network step
routes and times them like the hand-made ones.

* **Places:** termini and "via" places are found in a gazetteer, in this order: the hand-placed
  names in ``curation/network2010/places.json``, the curated stations, Overture transit places,
  then Overture neighbourhoods and towns (Quebec ones first for STO).
* **Order:** the farthest pair are the ends and the rest are inserted where they add the least
  length. The first direction ("inbound") ends nearest downtown.
* **Routing:** local routes keep to streets; peak and express routes may use the Transitway and
  highways (see ``WEIGHTS``).
* **Service:** the typical weekday pattern of the route's fare class (see ``service``).

Every route says so in its provenance (confidence "low", "approximate"). School, event,
early-morning and STO partner trips are not generated.
"""

from __future__ import annotations

import json
import math
import re
import unicodedata
from dataclasses import dataclass

from . import config

SKIP_CLASSES = {"school", "event", "early", "partner"}
PARLIAMENT = (-75.6990, 45.4236)
REGION_CENTRES = {"hull": (-75.735, 45.440), "aylmer": (-75.844, 45.395), "gatineau": (-75.650, 45.487),
                  "masson angers": (-75.423, 45.533), "buckingham": (-75.419, 45.588)}
# routing cost multipliers by edge class, per kind of route
WEIGHTS = {
    "local": {"motorway": 6.0, "link": 3.0, "busway": 2.5},
    "express": {"busway": 0.8, "motorway": 0.75, "trunk": 0.85},
    "rural": {"busway": 1.2},
}
# stop spacing (m) on streets, per kind of route: commuter routes stop rarely once out of their area
STOP_SPACING = {"local": 420, "express": 600, "rural": 1500}
MIN_LENGTH_KM = 0.9  # shorter "routes" are local loops whose places can't be told apart
ROUTE_COLORS = {"frequent": "#2856B8", "local": "#8794AB", "peak": "#6E7FA0", "rural": "#9A8C7A", "sto": "#0B97A3"}
NOTES = re.compile(r"\b(route|service|trips?|travels|operates|serves|starts|loop|special|local|n/a|bus lines?|"
                   r"bus service|transpo|emprunte|suit|passe)\b", re.I)


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\bste\b", "sainte", re.sub(r"\bst\b", "saint", s))
    return re.sub(r"\s+", " ", s).strip()


@dataclass
class Place:
    name: str
    lon: float
    lat: float
    station: str | None = None
    via: bool = False  # a bridge or other "via" point: routed through, not named


# ------------------------------------------------------------------------------------------ gazetteer

class Gazetteer:
    def __init__(self, stations: list[dict], manual: dict, divisions: list[dict], transit_places: list[dict]):
        self.stations = {s["id"]: s for s in stations}
        self.by_station_name = {norm(s["name"]): s for s in stations}
        self.manual = {norm(k): v for k, v in manual.items() if not k.startswith("_")}
        self.divisions = divisions  # {name, region, subtype, lon, lat}
        self.transit = [(norm(p["name"]), p) for p in transit_places if p.get("name")]

    def _value(self, name: str, v) -> list[Place]:
        if isinstance(v, str):
            s = self.stations[v]
            return [Place(s["name"], s["lon"], s["lat"], v)]
        if v and isinstance(v[0], (int, float)):
            return [Place(name, float(v[0]), float(v[1]))]
        return [p for x in v for p in self._value(name, x)]

    def find(self, query: str, agency: str = "octranspo", region: str | None = None) -> list[Place]:
        """A place name -> its waypoint(s), or [] when unknown."""
        label = query.strip()
        q = norm(label)
        q = re.sub(r"\b(station|secteur|sector)\b", "", q).strip()
        if not q:
            return []
        for key in ([f"{q} {region}"] if region else []) + [f"{q} {agency}", q]:
            if key in self.manual:
                return self._value(label, self.manual[key])
        if q in self.by_station_name:
            s = self.by_station_name[q]
            return [Place(s["name"], s["lon"], s["lat"], s["id"])]
        if len(q) >= 6:
            for n, p in self.transit:
                if re.search(rf"\b{re.escape(q)}\b", n):
                    return [Place(label, p["lon"], p["lat"])]
        want = "CA-QC" if agency == "sto" else "CA-ON"
        centre = REGION_CENTRES.get(region or "", PARLIAMENT)
        for exact in (True, False):
            hits = [d for d in self.divisions if (norm(d["name"]) == q if exact else norm(d["name"]).startswith(q + " "))]
            if hits:
                d = min(hits, key=lambda d: (d["region"] != want, _km((d["lon"], d["lat"]), centre)))
                if _km((d["lon"], d["lat"]), PARLIAMENT) < 80:
                    return [Place(label, d["lon"], d["lat"])]
        return []


def _km(a, b) -> float:
    return math.hypot((a[0] - b[0]) * 78.2, (a[1] - b[1]) * 111.0)


def load_gazetteer(stations: list[dict]) -> Gazetteer:
    import pyarrow.parquet as pq
    import shapely

    manual = json.loads((config.CURATION / "network2010" / "places.json").read_text())["places"]
    divs, transit = [], []
    path = config.RAW / "overture" / "division.parquet"
    if path.exists():
        for r in pq.read_table(path).to_pylist():
            g = shapely.from_wkb(r["geometry"])
            if r.get("name") and g.geom_type == "Point":
                divs.append({"name": r["name"], "region": r.get("region"), "subtype": r.get("subtype"), "lon": g.x, "lat": g.y})
    path = config.RAW / "overture" / "transit_place.parquet"
    if path.exists():
        for r in pq.read_table(path).to_pylist():
            g = shapely.from_wkb(r["geometry"])
            transit.append({"name": r.get("name"), "lon": g.centroid.x, "lat": g.centroid.y})
    return Gazetteer(stations, manual, divs, transit)


# ------------------------------------------------------------------------------------------ termini

BRIDGES = {"portage": "pont du portage", "alexandra": "pont alexandra", "macdonald": "pont macdonald cartier",
           "champlain": "pont champlain", "chaudiere": "pont de la chaudiere"}


def parse_termini(termini: list[str]) -> tuple[list[tuple[str, str | None, bool]], bool]:
    """Catalogue termini -> ([(place query, region hint, is a via point)], uses_highway). Notes are dropped."""
    out: list[tuple[str, str | None, bool]] = []
    highway = False
    for raw in termini:
        t = re.sub(r"^.*\|\s*", "", raw).replace("*", "").strip()  # table-markup leftovers, footnote marks
        t = re.sub(r"\((?:apr[eè]s|certains|some)[^)]*\)", "", t, flags=re.I)
        if not t or NOTES.search(t):  # notes from the table ("Serves the new neighborhood ...")
            continue
        region = None
        for m in list(re.finditer(r"\(([^)]+)\)", t))[::-1]:  # "(Secteur Hull)" is a region hint, "(Campus de Hull)" part of the name
            r = re.sub(r"^secteur ", "", norm(m.group(1)))
            if r in REGION_CENTRES:
                region = r
            t = (t[:m.start()] + (" " if r not in REGION_CENTRES else "") + m.group(1) * (r not in REGION_CENTRES)
                 + t[m.end():]).strip()
        m = re.search(r"(?:^|\s)via\s+", t, re.I)
        head, via = (t[:m.start()].strip(), t[m.end():].strip()) if m else (t, "")
        if re.search(r"autoroute|highway|417|174", via, re.I):
            highway = True
        via_places = []
        for part in re.split(r"\s+(?:&|et|and)\s+", via):
            part = re.split(r"\s+ou\s+", part)[0].strip()
            key = next((BRIDGES[b] for b in BRIDGES if b in norm(part)), None)
            if key:
                via_places.append((key, None, True))
            elif part and not re.search(r"autoroute|highway", part, re.I):
                via_places.append((part.replace("downtown Ottawa", "Ottawa"), None, False))
        heads = [p.strip() for p in re.split(r"\s+(?:&|-|–|et)\s+", head) if p.strip() and len(p.split()) <= 6]
        if heads and norm(heads[0]) in ("ottawa", "downtown ottawa"):  # "Ottawa via <bridge>": cross, then downtown
            out += via_places + [(h, region, False) for h in heads]
        else:
            out += [(h.replace("/", " "), region, False) for h in heads] + via_places
    return out, highway


def order_places(places: list[Place]) -> list[Place]:
    """Unique places in route order: the farthest pair as ends, the rest by cheapest insertion."""
    uniq: list[Place] = []
    for p in places:
        if all(_km((p.lon, p.lat), (q.lon, q.lat)) > 0.3 for q in uniq):
            uniq.append(p)
    if len(uniq) <= 2:
        return uniq
    d = lambda a, b: _km((a.lon, a.lat), (b.lon, b.lat))  # noqa: E731
    i, j = max(((i, j) for i in range(len(uniq)) for j in range(i + 1, len(uniq))), key=lambda ij: d(uniq[ij[0]], uniq[ij[1]]))
    path = [uniq[i], uniq[j]]
    rest = [p for k, p in enumerate(uniq) if k not in (i, j)]
    while rest:
        best = None
        for p in rest:
            for k in range(len(path) - 1):
                extra = d(path[k], p) + d(p, path[k + 1]) - d(path[k], path[k + 1])
                if best is None or extra < best[0]:
                    best = (extra, p, k + 1)
        _, p, k = best
        path.insert(k, p)
        rest.remove(p)
    return path


def inbound(path: list[Place]) -> list[Place]:
    """Orient so the route ends nearest downtown (the AM-peak direction)."""
    first, last = path[0], path[-1]
    return path[::-1] if _km((first.lon, first.lat), PARLIAMENT) < _km((last.lon, last.lat), PARLIAMENT) else path


# ------------------------------------------------------------------------------------------ service

def _p(a: str, b: str, h: float) -> dict:
    return {"from": a, "to": b, "headwayMin": h}


def service(agency: str, cls: str, number: str) -> tuple[list[dict], list[dict]]:
    """Typical 2010 weekday service for a fare class: (inbound periods, outbound periods)."""
    n = int(re.match(r"\d+", number).group()) if re.match(r"\d+", number) else 999
    if cls == "regular":
        if agency == "sto":
            p = [_p("05:45", "09:00", 15), _p("09:00", "15:30", 30), _p("15:30", "18:30", 15), _p("18:30", "24:00", 30)]
        elif n < 20:
            p = [_p("05:30", "06:30", 20), _p("06:30", "09:00", 10), _p("09:00", "15:30", 15), _p("15:30", "18:30", 10),
                 _p("18:30", "25:00", 20)]
        elif n < 100:
            p = [_p("06:00", "09:00", 15), _p("09:00", "15:30", 15), _p("15:30", "18:30", 15), _p("18:30", "24:30", 30)]
        elif n < 200:
            p = [_p("06:00", "09:00", 15), _p("09:00", "15:30", 30), _p("15:30", "18:30", 15), _p("18:30", "24:00", 30)]
        else:
            p = [_p("06:00", "09:00", 30), _p("09:00", "15:30", 60), _p("15:30", "18:30", 30), _p("18:30", "23:00", 60)]
        return p, p
    if cls == "express":
        return [_p("06:15", "08:30", 15)], [_p("15:45", "18:00", 15)]
    if cls == "peak":
        return [_p("06:15", "08:45", 20)], [_p("15:30", "18:00", 20)]
    return [_p("06:00", "07:30", 30)], [_p("16:00", "17:30", 30)]  # rural / interzone commuter trips


def route_class(agency: str, cls: str, number: str) -> str:
    if agency == "sto":
        return "sto"
    if cls in ("peak", "express"):
        return "peak"
    if cls in ("rural", "interzone"):
        return "rural"
    n = int(re.match(r"\d+", number).group()) if re.match(r"\d+", number) else 999
    return "frequent" if n < 20 or 80 <= n < 100 else "local"


# ------------------------------------------------------------------------------------------ routes

def approx_routes(catalogue: list[dict], gaz: Gazetteer, have: set[str]) -> tuple[list[dict], list[dict]]:
    """Route definitions for catalogue routes not in ``have`` -> (routes, skipped [{id, why}])."""
    merged: dict[str, dict] = {}
    for e in catalogue:
        rid = f"{'oct' if e['agency'] == 'octranspo' else 'sto'}-{e['number']}"
        if rid in have or e["class"] in SKIP_CLASSES:
            continue
        m = merged.setdefault(rid, {**e, "termini": []})
        m["termini"] += e["termini"]
    routes, skipped = [], []
    for rid, e in merged.items():
        queries, highway = parse_termini(e["termini"])
        places, missing = [], []
        for q, region, via in queries:
            found = gaz.find(q, e["agency"], region)
            if found:
                places += [Place(f.name, f.lon, f.lat, f.station, via) for f in found]
            else:
                missing.append(q)
        path = order_places(places)
        if len(path) < 2:
            skipped.append({"id": rid, "why": f"fewer than two places found (not found: {missing})"})
            continue
        if sum(_km((a.lon, a.lat), (b.lon, b.lat)) for a, b in zip(path, path[1:])) < MIN_LENGTH_KM:
            skipped.append({"id": rid, "why": f"its places are too close together to make a route ({[p.name for p in path]})"})
            continue
        path = inbound(path)
        inb, outb = service(e["agency"], e["class"], e["number"])
        cls = route_class(e["agency"], e["class"], e["number"])
        kind = "express" if e["class"] in ("peak", "express") or highway else (
            "rural" if e["class"] in ("rural", "interzone") else "local")
        names = [p.name for p in path if not p.via] or [p.name for p in path]
        note = (f"Approximate: routed between the places the 2010 source lists for it ({', '.join(e['termini'])[:200]}); "
                f"service is typical for its fare class ({e['class']}).")
        if missing:
            note += f" Not placed: {', '.join(missing)}."
        routes.append({
            "id": rid, "agency": e["agency"], "shortName": e["number"],
            "longName": " – ".join(dict.fromkeys(names)), "mode": "bus", "class": cls, "color": ROUTE_COLORS[cls],
            "patterns": [{"headsign": names[-1], "headsign_back": names[0],
                          "path": [p.station or f"@{p.lon:.5f},{p.lat:.5f}" for p in path],
                          "weekday": inb, "weekday_back": outb}],
            "summary": inb, "weights": kind, "stopSpacing": STOP_SPACING[kind],
            "provenance": {"source": e["source"], "confidence": "low", "verified": False, "note": note},
        })
    return routes, skipped
