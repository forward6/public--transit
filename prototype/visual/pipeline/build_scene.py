"""Build the illustrative December-2010 transit layers for the OTC visual mock-up.

Inputs are the GeoJSON layers written by fetch_overture.py.  Route geometry is
an *approximation* of the 2010 network for visual purposes only:

* Transitway (BRT): today's busway segments + the Confederation Line corridor
  (which replaced the Transitway), with the downtown tunnel swapped back for the
  2010 surface routing on Albert / Slater / Mackenzie King Bridge.
* O-Train: the Ellwood Subdivision light-rail corridor (Bayview - Greenboro).
* Bus corridors and STO corridors: selected named streets.
* Proposed (as of 2010): downtown rail tunnel, Rapibus corridor (dashed).

Vehicles and their trails are sampled randomly (seeded) along the lines.

Usage:  python build_scene.py DATA_DIR
"""

from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

from shapely.geometry import LineString, MultiLineString, Point, box, mapping, shape
from shapely.ops import linemerge, substring, unary_union

LAT0 = 45.42
KX = 111_320 * math.cos(math.radians(LAT0))  # metres per degree lon
KY = 110_950  # metres per degree lat

COLORS = {
    "brt": "#D7263D",
    "otrain": "#2E9E5B",
    "frequent": "#2856B8",
    "local": "#7C8BA6",
    "sto": "#0E9AA7",
    "proposed_rail": "#8E3B9E",
    "proposed_sto": "#0E9AA7",
}

FREQUENT = {
    "Bank Street": None,
    "Rideau Street": None,
    "Montréal Road": (-75.70, -75.62),
    "Carling Avenue": (-75.79, -75.695),
    "Richmond Road": None,
    "Wellington Street West": None,
    "Somerset Street West": None,
    "Bronson Avenue": None,
    "St-Laurent Boulevard": None,
    "Baseline Road": None,
}
LOCAL = [
    "Elgin Street", "Preston Street", "Booth Street", "Gladstone Avenue", "Beechwood Avenue",
    "Sussex Drive", "King Edward Avenue", "Main Street", "Smyth Road", "Riverside Drive",
    "Alta Vista Drive", "Parkdale Avenue", "Holland Avenue", "Scott Street", "Laurier Avenue East",
    "Laurier Avenue West", "Kirkwood Avenue", "Merivale Road", "Industrial Avenue", "Heron Road",
    "Coventry Road", "Ogilvie Road", "Walkley Road", "Prince Of Wales Drive", "Fisher Avenue",
    "Woodroffe Avenue", "McArthur Avenue", "Donald Street", "Lees Avenue", "Churchill Avenue North",
    "Dalhousie Street", "St. Patrick Street", "Hawthorne Road", "Tremblay Road", "Cyrville Road",
    "Russell Road", "Belfast Road", "Pleasant Park Road", "Kilborn Avenue", "Byron Avenue",
]
STO = {
    "Boulevard Maisonneuve": None,
    "Boulevard Alexandre-Taché": None,
    "Boulevard Saint-Joseph": None,
    "Rue Montcalm": None,
    "Boulevard des Allumettières": None,
    "Boulevard de la Cité-des-Jeunes": None,
    "Boulevard du Mont-Bleu": None,
    "Boulevard Saint-Raymond": None,
    "Rue Laurier": None,
    "Boulevard Fournier": None,
    "Boulevard Gréber": None,
    "Boulevard Maloney Ouest": None,
    "Boulevard Saint-René Ouest": None,
    "Rue Saint-Louis": None,
    "Portage Bridge": None,
    "Pont de la Chaudière": None,
    "Alexandra Bridge": None,
    "Wellington Street": None,
    "Chemin d'Aylmer": (-75.83, -75.76),
}
DOWNTOWN_BRT = {
    "Albert Street": (-75.7155, -75.6915),
    "Slater Street": (-75.7155, -75.6915),
    "Mackenzie King Bridge": None,
    "Waller Street": None,
    "Nicholas Street": None,
}
TUNNEL_X = (-75.7125, -75.6835)  # Confederation Line tunnel section to swap out

BRT_STATIONS = {
    "Tunney's Pasture": (-75.7355, 45.4037),
    "Bayview": (-75.7215, 45.4092),
    "LeBreton": (-75.7137, 45.4128),
    "Campus": (-75.6832, 45.4210),
    "Lees": (-75.6705, 45.4163),
    "Hurdman": (-75.6646, 45.4122),
    "St-Laurent": (-75.6385, 45.4208),
    "Westboro": (-75.7522, 45.3963),
    "Billings Bridge": (-75.6765, 45.3848),
    "Mackenzie King": (-75.6905, 45.4248),
}
OTRAIN_STATIONS = {
    "Carling": (-75.7095, 45.3967),
    "Carleton": (-75.6966, 45.3857),
    "Confederation": (-75.6857, 45.3733),
    "Greenboro": (-75.6590, 45.3598),
}


def to_m(x, y):
    return ((x + 75.7) * KX, (y - LAT0) * KY)


def to_ll(x, y):
    return (x / KX - 75.7, y / KY + LAT0)


def proj(g):
    if g.geom_type == "LineString":
        return LineString([to_m(*c) for c in g.coords])
    if g.geom_type == "MultiLineString":
        return MultiLineString([[to_m(*c) for c in p.coords] for p in g.geoms])
    raise ValueError(g.geom_type)


def unproj_line(ls):
    return [list(map(lambda v: round(v, 6), to_ll(*c))) for c in ls.coords]


def lines_of(g):
    if g.is_empty:
        return []
    if g.geom_type == "LineString":
        return [g]
    if g.geom_type in ("MultiLineString", "GeometryCollection"):
        return [p for p in g.geoms if p.geom_type == "LineString"]
    return []


def load(data, name):
    return json.load(open(data / name))["features"]


def by_name(features, names: dict | list, xr_default=None):
    out = {}
    names = names if isinstance(names, dict) else {n: None for n in names}
    for f in features:
        n = f["properties"].get("name")
        if n in names:
            g = shape(f["geometry"])
            xr = names[n] or xr_default
            if xr:
                g = g.intersection(box(xr[0], 40, xr[1], 50))
            out.setdefault(n, []).extend(lines_of(g))
    return {n: merge(ls) for n, ls in out.items()}


def merge(lines):
    m = linemerge(unary_union(lines)) if lines else None
    return lines_of(m) if m is not None else []


def main():
    data = Path(sys.argv[1])
    rng = random.Random(2010)
    roads = load(data, "roads.geojson")
    rail = load(data, "rail.geojson")
    busways = load(data, "busways.geojson")

    net = []  # (kind, name, LineString in lon/lat, load)

    # --- Transitway (BRT, 2010 approximation) ---------------------------------
    brt = [ls for f in busways for ls in lines_of(shape(f["geometry"]))]
    for f in rail:
        n = f["properties"].get("name") or ""
        g = shape(f["geometry"])
        if n in ("Confederation Line", "Confederation Line - East Extension"):
            outside = g.difference(box(TUNNEL_X[0], 45.40, TUNNEL_X[1], 45.44))
            brt += lines_of(outside)
        elif n == "Confederation Line - West Extension":
            brt += lines_of(g)
    for n, ls in by_name(roads, DOWNTOWN_BRT).items():
        if n == "Nicholas Street":
            ls = [l for l in ls for l in lines_of(l.intersection(box(-75.69, 45.4185, -75.68, 45.4262)))]
        if n == "Waller Street":
            ls = [l for l in ls for l in lines_of(l.intersection(box(-75.70, 45.4215, -75.68, 45.427)))]
        for l in ls:
            net.append(("brt", "Transitway — downtown (Albert/Slater)", l, 1.0))
    for l in merge(brt):
        net.append(("brt", "Transitway", l, 0.75))

    # --- O-Train (Bayview - Greenboro) ------------------------------------------
    ot = []
    for f in rail:
        n = f["properties"].get("name") or ""
        if n.startswith("Ellwood Subdivision") or n.startswith("Walkley Interlocking"):
            ot += lines_of(shape(f["geometry"]))
    ot = [l for g in merge(ot) for l in lines_of(g.intersection(box(-75.73, 45.357, -75.65, 45.4105)))]
    for l in merge(ot):
        net.append(("otrain", "O-Train", l, 0.5))

    # --- Proposed in 2010 --------------------------------------------------------
    tun = []
    for f in rail:
        if (f["properties"].get("name") or "") == "Confederation Line":
            tun += lines_of(shape(f["geometry"]).intersection(box(TUNNEL_X[0] - 0.001, 45.40, TUNNEL_X[1] + 0.001, 45.44)))
    for l in merge(tun):
        net.append(("proposed_rail", "Proposed: downtown rail tunnel", l, 0))
    rap = []
    for f in rail:
        n = f["properties"].get("name") or ""
        if "Lachute" in n or n == "Rapibus":
            rap += lines_of(shape(f["geometry"]))
    for l in merge(rap):
        net.append(("proposed_sto", "Proposed: Rapibus (STO)", l, 0))

    # --- Bus corridors -------------------------------------------------------------
    for n, ls in by_name(roads, FREQUENT).items():
        for l in ls:
            net.append(("frequent", n, l, 0.45 + 0.25 * rng.random()))
    for n, ls in by_name(roads, LOCAL).items():
        for l in ls:
            net.append(("local", n, l, 0.15 + 0.15 * rng.random()))
    for n, ls in by_name(roads, STO).items():
        for l in ls:
            net.append(("sto", n, l, 0.35 + 0.3 * rng.random()))

    net = [(k, n, l, ld) for (k, n, l, ld) in net if l.length > 0.0004]
    feats = [
        {"type": "Feature", "properties": {"kind": k, "name": n, "color": COLORS[k], "load": round(ld, 2)},
         "geometry": {"type": "LineString", "coordinates": [[round(x, 6), round(y, 6)] for x, y in l.coords]}}
        for k, n, l, ld in net
    ]
    json.dump({"type": "FeatureCollection", "features": feats}, open(data / "network.geojson", "w"), separators=(",", ":"))
    print("network", len(feats))

    # --- Stations (snapped to their line) -----------------------------------------
    def snap(pt, kinds):
        best = None
        for k, n, l, _ in net:
            if k in kinds:
                d = l.distance(Point(pt))
                if best is None or d < best[0]:
                    best = (d, l.interpolate(l.project(Point(pt))))
        return best[1]

    st = []
    for n, pt in BRT_STATIONS.items():
        p = snap(pt, {"brt"})
        st.append({"type": "Feature", "properties": {"name": n, "kind": "brt"}, "geometry": mapping(p)})
    for n, pt in OTRAIN_STATIONS.items():
        p = snap(pt, {"otrain"})
        st.append({"type": "Feature", "properties": {"name": n, "kind": "otrain"}, "geometry": mapping(p)})
    bay = snap(BRT_STATIONS["Bayview"], {"otrain"})
    st.append({"type": "Feature", "properties": {"name": "Bayview", "kind": "transfer"}, "geometry": mapping(bay)})
    json.dump({"type": "FeatureCollection", "features": st}, open(data / "stations.geojson", "w"))

    # --- Vehicles + trails -------------------------------------------------------------
    density = {"brt": 6.5, "otrain": 0.55, "frequent": 2.4, "local": 0.9, "sto": 1.6}  # vehicles per km
    trail_m = {"brt": 260, "otrain": 420, "frequent": 200, "local": 160, "sto": 200}
    vehicles, trails = [], []
    for k, n, l, ld in net:
        if k not in density:
            continue
        lm = proj(l)
        km = lm.length / 1000
        dens = density[k] * (2.6 if "downtown" in n else 1.0)
        count = int(km * dens + rng.random())
        for _ in range(count):
            if lm.length < 40:
                continue
            d = rng.uniform(0, lm.length)
            fwd = rng.random() < 0.5
            tl = trail_m[k] * rng.uniform(0.7, 1.2)
            a, b = (max(0, d - tl), d) if fwd else (min(lm.length, d + tl), d)
            seg = substring(lm, min(a, b), max(a, b))
            coords = list(seg.coords)
            tail_to_head = coords if fwd else coords[::-1]  # order tail -> head
            if len(tail_to_head) < 2:
                continue
            hx, hy = tail_to_head[-1]
            px, py = tail_to_head[-2]
            bearing = math.degrees(math.atan2(hx - px, hy - py)) % 360
            crowd = min(1.0, max(0.0, rng.gauss(ld, 0.18)))
            head = to_ll(hx, hy)
            vehicles.append({"type": "Feature", "properties": {"kind": k, "color": COLORS[k], "bearing": round(bearing, 1), "crowd": round(crowd, 2)},
                             "geometry": {"type": "Point", "coordinates": [round(head[0], 6), round(head[1], 6)]}})
            trails.append({"type": "Feature", "properties": {"kind": k, "color": COLORS[k]},
                           "geometry": {"type": "LineString", "coordinates": [[round(v, 6) for v in to_ll(x, y)] for x, y in tail_to_head]}})
    json.dump({"type": "FeatureCollection", "features": vehicles}, open(data / "vehicles.geojson", "w"), separators=(",", ":"))
    json.dump({"type": "FeatureCollection", "features": trails}, open(data / "trails.geojson", "w"), separators=(",", ":"))
    print("vehicles", len(vehicles))

    # --- Thinned buildings with default heights --------------------------------------
    b = load(data, "buildings.geojson")
    keep = []
    for f in b:
        g = shape(f["geometry"])
        area = g.area * KX * KY
        if area < 45:
            continue
        h = f["properties"].get("h")
        if not h:
            h = 9.0 if area > 400 else 6.5
        keep.append({"type": "Feature", "properties": {"h": round(min(h, 140), 1)}, "geometry": f["geometry"]})
    json.dump({"type": "FeatureCollection", "features": keep}, open(data / "buildings_min.geojson", "w"), separators=(",", ":"))
    print("buildings", len(keep), "of", len(b))


if __name__ == "__main__":
    main()
