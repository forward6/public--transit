"""Planning-mode layers for the OTC visual mock-up (summer scene).

* draft.geojson      - a player-drawn draft: O-Train extension Bayview -> Prince of
                       Wales Bridge -> Hull, built from the old rail corridor geometry
* draft_stops.geojson- proposed stations on the draft
* bloom.geojson      - travel-time "bloom" hexagons from one origin, WITH the draft
* bloom_before.geojson - 30-min reach outline WITHOUT the draft (for comparison)

The travel-time model is a deliberately simple walk + ride + wait graph
(Dijkstra) over the illustrative 2010 network in network.geojson.  It is a
visual stand-in for the real RAPTOR-based model described in docs/PLAN.md.

Usage: python build_plan_scene.py DATA_DIR
"""

from __future__ import annotations

import heapq
import json
import math
import sys
from pathlib import Path

from shapely import STRtree, make_valid, prepare
from shapely.geometry import LineString, Point, Polygon, mapping, shape
from shapely.ops import linemerge, unary_union

LAT0 = 45.42
KX = 111_320 * math.cos(math.radians(LAT0))
KY = 110_950
BBOX = (-75.80, 45.375, -75.62, 45.47)
HEX_M = 135  # hex "radius" (centre to corner), metres
WALK = 78  # metres / minute
SPEED = {"brt": 480, "otrain": 620, "draft": 620, "frequent": 290, "sto": 300, "local": 240}  # m/min
WAIT = {"brt": 3, "otrain": 6, "draft": 5, "frequent": 5, "sto": 7, "local": 10}
STATION_ONLY = {"brt", "otrain", "draft"}
ORIGIN = "Montcalm"

DRAFT_STATIONS = {
    "Bayview": (-75.7216, 45.40905),
    "Taché": (-75.7308, 45.4212),
    "Montcalm": (-75.7318, 45.4290),
    "Saint-Joseph": (-75.7312, 45.4385),
}


def m(x, y):
    return ((x + 75.7) * KX, (y - LAT0) * KY)


def ll(x, y):
    return (x / KX - 75.7, y / KY + LAT0)


def projline(coords):
    return LineString([m(*c) for c in coords])


def main():
    data = Path(sys.argv[1])
    rail = json.load(open(data / "rail.geojson"))["features"]
    net = json.load(open(data / "network.geojson"))["features"]
    stations = json.load(open(data / "stations.geojson"))["features"]
    water = unary_union([make_valid(shape(f["geometry"])) for f in json.load(open(data / "water.geojson"))["features"]
                         if f["geometry"]["type"] in ("Polygon", "MultiPolygon") and f["properties"].get("subtype") != "human_made"])
    prepare(water)

    # ---- draft line from the old Prince of Wales Bridge rail corridor -------------
    parts = []
    for f in rail:
        n = f["properties"].get("name") or ""
        g = shape(f["geometry"])
        if n == "Ottawa River Line" or n == "Lachute Subdivision":
            parts.append(g)
        if n == "Subdivision Lachute":
            parts.append(g.intersection(Polygon([(-75.74, 45.419), (-75.72, 45.419), (-75.72, 45.4405), (-75.74, 45.4405)])))
    pts = []
    for g in parts:
        for ls in (g.geoms if hasattr(g, "geoms") else [g]):
            pts.extend(ls.coords)
    # order the corridor south -> north and smooth gaps (the bridge itself has no rail mapped)
    path = [DRAFT_STATIONS["Bayview"]]
    pts = sorted(pts, key=lambda c: c[1])
    for c in pts:
        if c[1] > path[-1][1] - 0.0002:
            path.append(c)
    draft = LineString(path).simplify(0.00004)
    json.dump({"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"name": "Draft: O-Train to Hull via Prince of Wales Bridge"},
         "geometry": mapping(draft)}]}, open(data / "draft.geojson", "w"))
    dstops = []
    for name, c in DRAFT_STATIONS.items():
        p = draft.interpolate(draft.project(Point(c)))
        dstops.append({"type": "Feature", "properties": {"name": name, "existing": name == "Bayview"},
                       "geometry": {"type": "Point", "coordinates": [round(p.x, 6), round(p.y, 6)]}})
    json.dump({"type": "FeatureCollection", "features": dstops}, open(data / "draft_stops.geojson", "w"))

    # ---- graph ------------------------------------------------------------------------
    lines = []  # (kind, LineString metres, station points metres or None)
    st_by_kind = {"brt": [], "otrain": []}
    for f in stations:
        k = f["properties"]["kind"]
        if k in st_by_kind:
            st_by_kind[k].append(Point(m(*f["geometry"]["coordinates"])))
    for f in net:
        k = f["properties"]["kind"]
        if k in SPEED:
            lines.append((k, projline(f["geometry"]["coordinates"]), st_by_kind.get(k)))
    draft_m = projline(draft.coords)
    draft_st = [Point(m(*s["geometry"]["coordinates"])) for s in dstops]

    def build_and_run(with_draft: bool):
        nodes = []  # (x, y)
        adj = []

        def add(x, y):
            nodes.append((x, y))
            adj.append([])
            return len(nodes) - 1

        def edge(a, b, w):
            adj[a].append((b, w))
            adj[b].append((a, w))

        stop_nodes = []  # (foot node, kind)
        all_lines = lines + ([("draft", draft_m, draft_st)] if with_draft else [])
        origin_node = None
        for k, ls, stp in all_lines:
            L = ls.length
            if L < 50:
                continue
            if k in STATION_ONLY and stp:
                ds = sorted({ls.project(p) for p in stp if ls.distance(p) < 120})
                if len(ds) < 1:
                    continue
            else:
                n = max(2, int(L / 250) + 1)
                ds = [L * i / (n - 1) for i in range(n)]
            prev = None
            for d in ds:
                p = ls.interpolate(d)
                ride = add(p.x, p.y)
                foot = add(p.x, p.y)
                adj[foot].append((ride, WAIT[k]))  # board
                adj[ride].append((foot, 0.5))  # alight
                stop_nodes.append((foot, k))
                if prev is not None:
                    edge(prev[0], ride, (d - prev[1]) / SPEED[k])
                prev = (ride, d)
                if with_draft is not None and k == "draft" and Point(p.x, p.y).distance(draft_st[2]) < 5:
                    origin_node = foot
        if origin_node is None:  # origin on foot near the Montcalm station even without the draft
            origin_node = add(*draft_st[2].coords[0])
            stop_nodes.append((origin_node, "walk"))

        # hex grid
        w, s, e, n = BBOX
        x0, y0 = m(w, s)
        x1, y1 = m(e, n)
        dx = math.sqrt(3) * HEX_M
        dy = 1.5 * HEX_M
        hexes = []
        row = 0
        y = y0
        while y < y1:
            x = x0 + (dx / 2 if row % 2 else 0)
            while x < x1:
                if not water.contains(Point(ll(x, y))):
                    hexes.append((x, y, add(x, y)))
                x += dx
            y += dy
            row += 1
        # walk links hex<->hex
        hpts = [Point(x, y) for x, y, _ in hexes]
        tree = STRtree(hpts)
        for i, (x, y, nid) in enumerate(hexes):
            for j in tree.query(Point(x, y).buffer(dx * 1.05)):
                if j > i:
                    edge(nid, hexes[j][2], dx / WALK)
        # walk links stop<->hex, stop<->stop (transfers)
        spts = [Point(nodes[f]) for f, _ in stop_nodes]
        stree = STRtree(spts)
        for i, (fnode, k) in enumerate(stop_nodes):
            p = spts[i]
            for j in tree.query(p.buffer(400)):
                edge(fnode, hexes[j][2], p.distance(hpts[j]) / WALK * 1.25 + 0.5)
            for j in stree.query(p.buffer(220)):
                if j > i:
                    edge(fnode, stop_nodes[j][0], p.distance(spts[j]) / WALK * 1.25 + 0.5)

        dist = [math.inf] * len(nodes)
        dist[origin_node] = 0
        pq = [(0, origin_node)]
        while pq:
            d, u = heapq.heappop(pq)
            if d > dist[u] or d > 60:
                continue
            for v, wgt in adj[u]:
                nd = d + wgt
                if nd < dist[v]:
                    dist[v] = nd
                    heapq.heappush(pq, (nd, v))
        return [(x, y, dist[nid]) for x, y, nid in hexes]

    after = build_and_run(True)
    before = build_and_run(False)

    def hexpoly(x, y, r=HEX_M * 0.97):
        return [list(map(lambda v: round(v, 6), ll(x + r * math.cos(math.radians(60 * i + 30)), y + r * math.sin(math.radians(60 * i + 30))))) for i in range(7)]

    feats = []
    gain = 0
    for (x, y, t), (_, _, tb) in zip(after, before):
        if t <= 45:
            band = 10 if t <= 10 else 20 if t <= 20 else 30 if t <= 30 else 45
            feats.append({"type": "Feature", "properties": {"t": round(t, 1), "band": band, "new": tb > 30 >= t},
                          "geometry": {"type": "Polygon", "coordinates": [hexpoly(x, y)]}})
            gain += tb > 30 >= t
    json.dump({"type": "FeatureCollection", "features": feats}, open(data / "bloom.geojson", "w"), separators=(",", ":"))
    reach = unary_union([Point(x, y).buffer(HEX_M * 1.05, 2) for x, y, t in before if t <= 30]).simplify(60)
    outline = []
    for poly in (reach.geoms if hasattr(reach, "geoms") else [reach]):
        if poly.area > 4 * HEX_M * HEX_M:
            outline.append({"type": "Feature", "properties": {},
                            "geometry": {"type": "LineString", "coordinates": [list(ll(*c)) for c in poly.exterior.coords]}})
    json.dump({"type": "FeatureCollection", "features": outline}, open(data / "bloom_before.geojson", "w"))
    print("bloom hexes", len(feats), "newly within 30 min:", gain)


if __name__ == "__main__":
    main()
