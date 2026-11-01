"""Build the 2010 transit network: apps/web/public/data/network-2010.json.

Inputs
  data/build/2010/roads.parquet, rail.parquet   (the 2010 base map, from ``curate``)
  data/raw/overture/segment.parquet             (today's busways and the LRT corridor)
  data/raw/overture/transit_place.parquet        (station positions)
  pipeline/curation/network2010/*.json           (infrastructure, stations, routes + provenance)

Output follows packages/shared/src/network.ts. Bus routes are only added from sourced
definitions (routes.json) or an imported GTFS feed (see ``gtfs.py``) — never invented.
"""

from __future__ import annotations

import json
import math
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import numpy as np
import pyarrow.parquet as pq
import shapely
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree
from shapely.geometry import Point, box

from . import config, dating

LON0, LAT0 = -75.7, 45.3
KX = 111_320 * math.cos(math.radians(LAT0))
KY = 110_950

# km/h by edge class (AM peak); downtown core is capped
SPEED_KMH = {"busway": 50, "motorway": 62, "trunk": 55, "primary": 26, "secondary": 24, "tertiary": 22,
             "minor": 20, "service": 15, "link": 20, "rail": 48}
DOWNTOWN = box(-75.716, 45.411, -75.684, 45.430)
DOWNTOWN_KMH = 12
# routing preference (multiplies length) so buses stay on arterials unless told otherwise
COST = {"busway": 0.55, "motorway": 0.9, "trunk": 0.9, "primary": 1.0, "secondary": 1.05, "tertiary": 1.2,
        "minor": 2.2, "service": 4.0, "link": 1.5, "rail": 1.0}
DWELL = {"station": 30, "stop": 15, "rail": 40}
OUTPUT = "network-2010.json"


def to_m_xy(lon, lat):
    return (np.asarray(lon) - LON0) * KX, (np.asarray(lat) - LAT0) * KY


def line_len_m(coords: np.ndarray) -> float:
    x, y = to_m_xy(coords[:, 0], coords[:, 1])
    return float(np.hypot(np.diff(x), np.diff(y)).sum())


# --------------------------------------------------------------------------------------- graph

@dataclass
class Edge:
    u: int
    v: int
    coords: np.ndarray  # lon/lat, oriented u -> v
    length: float
    cls: str


class Graph:
    """Undirected network graph. Lines are split only where they share a vertex with another
    line (Overture connectors are shared vertices), so overpasses do not create false junctions."""

    def __init__(self, lines: list[np.ndarray], classes: list[str]):
        keys_per_line = [self._keys(c) for c in lines]
        uniq = np.concatenate([np.unique(k) for k in keys_per_line]) if lines else np.array([], dtype=np.int64)
        vals, counts = np.unique(uniq, return_counts=True)
        junction = set(vals[counts >= 2].tolist())
        self.edges: list[Edge] = []
        node_ids: dict[int, int] = {}
        node_xy: list[tuple[float, float]] = []

        def nid(key: int, coord) -> int:
            if key not in node_ids:
                node_ids[key] = len(node_xy)
                node_xy.append((float(coord[0]), float(coord[1])))
            return node_ids[key]

        for coords, keys, cls in zip(lines, keys_per_line, classes):
            if len(coords) < 2:
                continue
            cut = [0] + [i for i in range(1, len(coords) - 1) if int(keys[i]) in junction] + [len(coords) - 1]
            for a, b in zip(cut, cut[1:]):
                seg = coords[a:b + 1]
                L = line_len_m(seg)
                if L <= 0:
                    continue
                self.edges.append(Edge(nid(int(keys[a]), coords[a]), nid(int(keys[b]), coords[b]), seg, L, cls))
        self.node_lonlat = np.array(node_xy) if node_xy else np.zeros((0, 2))
        x, y = to_m_xy(self.node_lonlat[:, 0], self.node_lonlat[:, 1]) if len(node_xy) else (np.array([]), np.array([]))
        self.tree = cKDTree(np.column_stack([x, y])) if len(node_xy) else None
        self._build_matrix()

    @staticmethod
    def _keys(c: np.ndarray) -> np.ndarray:
        kx = np.round(c[:, 0] * 1e6).astype(np.int64) + 200_000_000
        ky = np.round(c[:, 1] * 1e6).astype(np.int64) + 200_000_000
        return kx * 400_000_000 + ky

    def _build_matrix(self) -> None:
        n = len(self.node_lonlat)
        if not self.edges:
            self.matrix = coo_matrix((0, 0)).tocsr()
            self.best: dict[tuple[int, int], int] = {}
            return
        best: dict[tuple[int, int], tuple[float, int]] = {}
        for i, e in enumerate(self.edges):
            w = e.length * COST.get(e.cls, 1.5)
            for a, b in ((e.u, e.v), (e.v, e.u)):
                if a == b:
                    continue
                if (a, b) not in best or w < best[(a, b)][0]:
                    best[(a, b)] = (w, i)
        rows = np.array([k[0] for k in best], dtype=np.int64)
        cols = np.array([k[1] for k in best], dtype=np.int64)
        data = np.array([v[0] for v in best.values()])
        self.matrix = coo_matrix((data, (rows, cols)), shape=(n, n)).tocsr()
        self.best = {k: v[1] for k, v in best.items()}

    def add_links(self, max_m: float = 60.0, only_class: str = "busway") -> int:
        """Connect dangling ends of ``only_class`` edges (corridor pieces from another source, which
        share no vertices with the streets) to nearby nodes with short 'link' edges."""
        deg = np.zeros(len(self.node_lonlat), dtype=int)
        cls_nodes = set()
        for e in self.edges:
            deg[e.u] += 1
            deg[e.v] += 1
            if e.cls == only_class:
                cls_nodes.update((e.u, e.v))
        x, y = to_m_xy(self.node_lonlat[:, 0], self.node_lonlat[:, 1])
        added = 0
        for i in [n for n in np.flatnonzero(deg == 1) if n in cls_nodes]:
            for j in self.tree.query_ball_point([x[i], y[i]], max_m):
                if j == i:
                    continue
                c = np.array([self.node_lonlat[i], self.node_lonlat[j]])
                self.edges.append(Edge(int(i), int(j), c, max(line_len_m(c), 0.1), "link"))
                added += 1
        self._build_matrix()
        return added

    def nearest_node(self, lon: float, lat: float) -> tuple[int, float]:
        x, y = to_m_xy(lon, lat)
        d, i = self.tree.query([float(x), float(y)])
        return int(i), float(d)

    def path(self, a: int, b: int) -> list[Edge]:
        """Shortest path as a list of edges oriented a -> b (empty if a == b)."""
        if a == b:
            return []
        dist, pred = dijkstra(self.matrix, directed=True, indices=a, return_predecessors=True)
        if not np.isfinite(dist[b]):
            raise ValueError(f"no path between nodes {a} and {b}")
        seq = [b]
        while seq[-1] != a:
            seq.append(int(pred[seq[-1]]))
        seq.reverse()
        out = []
        for u, v in zip(seq, seq[1:]):
            e = self.edges[self.best[(u, v)]]
            coords = e.coords if (e.u, e.v) == (u, v) else e.coords[::-1]
            out.append(Edge(u, v, coords, e.length, e.cls))
        return out


def path_coords(edges: list[Edge]) -> np.ndarray:
    parts = [e.coords if i == 0 else e.coords[1:] for i, e in enumerate(edges)]
    return np.concatenate(parts) if parts else np.zeros((0, 2))


def path_time(edges: list[Edge], mode: str) -> float:
    t = 0.0
    for e in edges:
        if mode == "rail":
            kmh = SPEED_KMH["rail"]
        else:
            kmh = SPEED_KMH.get(e.cls, 20)
            mid = e.coords[len(e.coords) // 2]
            if DOWNTOWN.contains(Point(mid)):
                kmh = min(kmh, DOWNTOWN_KMH)
        t += e.length / (kmh / 3.6)
    return t


# ------------------------------------------------------------------------------------ helpers

def _read(path):
    t = pq.read_table(path)
    g = shapely.from_wkb(t["geometry"].to_numpy(zero_copy_only=False))
    return g, {c: t[c].to_pylist() for c in t.column_names if c != "geometry"}


def _lines(geom) -> list[np.ndarray]:
    return [np.asarray(p.coords) for p in shapely.get_parts(geom) if p.geom_type == "LineString" and len(p.coords) >= 2]


def _provenance(p: dict) -> dict:
    return {k: p[k] for k in ("source", "confidence", "verified", "note") if k in p}


def thresholds() -> dict[str, dating.Threshold]:
    rep = json.loads((config.REPORTS / "2010" / "report.json").read_text())
    return {t: dating.Threshold(**v) for t, v in rep["thresholds"].items()}


# ------------------------------------------------------------------------------------- building

def build_transitway(infra: dict, seg_g, seg, roads_g, roads) -> list[np.ndarray]:
    th = thresholds()
    old = dating.mapped_by_snapshot(seg["osm_type"], seg["osm_id"], th)
    names = np.array(seg["name"], dtype=object)
    lines: list[np.ndarray] = []
    for part in infra["transitway"]["parts"]:
        if part["kind"] == "busway":
            sel = (names == part["name"]) & (np.array(seg["subtype"], dtype=object) == "road")
            g_old = seg_g[sel & (old == 1)]
            g_new = seg_g[sel & (old != 1)]
            keep = list(g_old)
            if len(g_old) and len(g_new):  # re-mapped sections close to a 2010 busway
                near = shapely.dwithin(g_new, shapely.union_all(g_old), 40 / KY)
                keep += list(g_new[near])
            for g in keep:
                lines += _lines(g)
        elif part["kind"] == "rail":
            sel = names == part["name"]
            for g in seg_g[sel]:
                if "exclude_bbox" in part:
                    g = shapely.difference(g, box(*part["exclude_bbox"]))
                if "clip_bbox" in part:
                    g = shapely.clip_by_rect(g, *part["clip_bbox"])
                lines += _lines(g)
        elif part["kind"] == "road":
            rnames = np.array(roads["name"], dtype=object)
            for g in roads_g[np.isin(rnames, part["names"])]:
                if "clip_bbox" in part:
                    g = shapely.clip_by_rect(g, *part["clip_bbox"])
                lines += _lines(g)
    return lines


def place_stations(infra: dict, corridors: dict[str, list[np.ndarray]]) -> list[dict]:
    pg, p = _read(config.RAW / "overture" / "transit_place.parquet")
    by_name: dict[str, list[tuple[float, Point]]] = {}
    for g, n, c in zip(pg, p["name"], p["confidence"]):
        if n:
            by_name.setdefault(n.lower(), []).append((c or 0, g))
    corridor_geom = {k: shapely.MultiLineString([ln.tolist() for ln in v]) for k, v in corridors.items() if v}
    out = []
    for st in infra["stations"]:
        pt = None
        for m in st.get("match", []):
            cands = by_name.get(m.lower())
            if cands:
                pt = max(cands, key=lambda c: c[0])[1]
                break
        if pt is None and "at" in st:
            pt = Point(st["at"])
        if pt is None:
            print(f"  ! station {st['id']}: no position found")
            continue
        # snap to the nearest corridor this station serves
        best = None
        for c in st["corridors"]:
            geom = corridor_geom.get(c)
            if geom is None:
                continue
            snapped = _nearest_on(geom, pt)
            d = _dist_m(pt, snapped)
            if best is None or d < best[0]:
                best = (d, snapped)
        if best is not None and best[0] <= 250:
            pt = best[1]
        out.append({
            "id": st["id"], "name": st["name"], **({"name_fr": st["name_fr"]} if "name_fr" in st else {}),
            "lon": round(pt.x, 6), "lat": round(pt.y, 6), "kind": "station", "agencies": ["octranspo"],
            "provenance": {"source": "Station position: Overture places (today's map); existence in 2010: curated",
                           "confidence": st["confidence"], "verified": False, **({"note": st["note"]} if "note" in st else {})},
            "_corridors": st["corridors"],
        })
    return out


def _nearest_on(geom, pt: Point) -> Point:
    best = None
    for part in shapely.get_parts(geom):
        q = part.interpolate(part.project(pt))
        d = q.distance(pt)
        if best is None or d < best[0]:
            best = (d, q)
    return best[1]


def _dist_m(a: Point, b: Point) -> float:
    return math.hypot((a.x - b.x) * KX, (a.y - b.y) * KY)


def build_patterns(route: dict, graph: Graph, stops: dict[str, dict], mode: str) -> list[dict]:
    pats = []
    defs = list(route["patterns"])
    if route.get("bidirectional"):
        defs += [{"headsign": stops[p["stops"][0]]["name"], "stops": list(reversed(p["stops"])), "_reverse": True,
                  **({"via": list(reversed(p["via"]))} if "via" in p else {})} for p in route["patterns"]]
    for i, pd in enumerate(defs):
        nodes = [graph.nearest_node(stops[s]["lon"], stops[s]["lat"])[0] for s in pd["stops"]]
        legs = [graph.path(a, b) for a, b in zip(nodes, nodes[1:])]
        shape = path_coords([e for leg in legs for e in leg])
        dist, acc = [], 0.0
        for k, leg in enumerate(legs):
            dist.append(acc)
            acc += sum(e.length for e in leg)
        dist.append(acc)
        run = [round(path_time(leg, mode) + (20 if mode == "rail" else 0), 1) for leg in legs]
        dwell = [DWELL["rail"] if mode == "rail" else DWELL[stops[s]["kind"]] for s in pd["stops"]]
        dwell[0] = dwell[-1] = 0
        pats.append({
            "id": f"{route['id']}-{i}", "routeId": route["id"], "direction": 1 if pd.get("_reverse") else 0,
            "headsign": pd["headsign"], "stops": pd["stops"], "stopDist": [round(d, 1) for d in dist],
            "shape": [[round(x, 6), round(y, 6)] for x, y in shape], "runTimes": run, "dwell": dwell,
        })
    return pats


def build_network(gtfs: str | None = None) -> dict:
    t0 = time.time()
    cur = config.CURATION / "network2010"
    infra = json.loads((cur / "infrastructure.json").read_text())
    routes_def = json.loads((cur / "routes.json").read_text())
    roads_g, roads = _read(config.BUILD / "2010" / "roads.parquet")
    rail_g, rail = _read(config.BUILD / "2010" / "rail.parquet")
    seg_g, seg = _read(config.RAW / "overture" / "segment.parquet")

    # corridors -----------------------------------------------------------------------------
    tw_lines = build_transitway(infra, seg_g, seg, roads_g, roads)
    ot_lines = [ln for g, n, c in zip(rail_g, rail["name"], rail["class"]) if n == "O-Train" and c == "light_rail" for ln in _lines(g)]
    print(f"  transitway: {len(tw_lines)} pieces, {sum(line_len_m(l) for l in tw_lines) / 1000:.1f} km; "
          f"O-Train: {len(ot_lines)} pieces, {sum(line_len_m(l) for l in ot_lines) / 1000:.1f} km")

    # graphs ----------------------------------------------------------------------------------
    road_lines, road_cls = [], []
    for g, c in zip(roads_g, roads["class"]):
        for ln in _lines(g):
            road_lines.append(ln)
            road_cls.append(c)
    bus = Graph(road_lines + tw_lines, road_cls + ["busway"] * len(tw_lines))
    links = bus.add_links(60)
    rail_graph = Graph(ot_lines, ["rail"] * len(ot_lines))
    print(f"  bus graph: {len(bus.node_lonlat):,} nodes, {len(bus.edges):,} edges ({links} links); rail graph: {len(rail_graph.edges)} edges")

    # stations -----------------------------------------------------------------------------------
    stations = place_stations(infra, {"transitway": tw_lines, "otrain": ot_lines})
    stops = {s["id"]: s for s in stations}

    # routes ---------------------------------------------------------------------------------------
    routes, patterns = [], []
    if gtfs:
        from .gtfs import import_gtfs
        g_routes, g_patterns, g_stops = import_gtfs(gtfs, bus)
        routes += g_routes
        patterns += g_patterns
        stops.update({s["id"]: s for s in g_stops})
    for r in routes_def["routes"]:
        graph = rail_graph if r["mode"] == "rail" else bus
        pats = build_patterns(r, graph, stops, r["mode"])
        patterns += pats
        routes.append({k: r[k] for k in ("id", "agency", "shortName", "longName", "mode", "class", "color") if k in r}
                      | {"patterns": [p["id"] for p in pats], "weekday": r.get("weekday"),
                         "provenance": _provenance(r["provenance"]),
                         **({"longName_fr": r["longName_fr"]} if "longName_fr" in r else {})})

    has_bus = any(r["mode"] != "rail" for r in routes)
    status = "gtfs" if gtfs else ("archive-reconstruction" if has_bus else "infrastructure-only")
    note = {
        "gtfs": "2010 service imported from an archived OC Transpo GTFS feed.",
        "archive-reconstruction": "2010 routes reconstructed from archived maps and timetables (see provenance per route).",
        "infrastructure-only": "Transitway corridor, stations and the original O-Train only. The 2010 bus routes will be "
                               "loaded from archived sources (OC Transpo GTFS / system maps) once they are reachable.",
    }[status]
    network = {
        "version": 1,
        "snapshot": config.SNAPSHOT_DATE,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "status": status,
        "statusNote": note,
        "corridors": [
            {"id": infra["transitway"]["id"], "name": infra["transitway"]["name"], "kind": "busway", "agency": "octranspo",
             "lines": [[[round(x, 6), round(y, 6)] for x, y in ln] for ln in tw_lines],
             "provenance": _provenance(infra["transitway"]["provenance"])},
            {"id": infra["otrain"]["id"], "name": infra["otrain"]["name"], "kind": "rail", "agency": "octranspo",
             "lines": [[[round(x, 6), round(y, 6)] for x, y in ln] for ln in ot_lines],
             "provenance": _provenance(infra["otrain"]["provenance"])},
        ],
        "stops": [{k: v for k, v in s.items() if not k.startswith("_")} for s in stops.values()],
        "routes": routes,
        "patterns": patterns,
    }
    out = config.WEB_DATA / OUTPUT
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(network, separators=(",", ":"), ensure_ascii=False))
    print(f"  {len(network['stops'])} stops, {len(routes)} routes, {len(patterns)} patterns -> "
          f"{out.relative_to(config.REPO)} ({out.stat().st_size / 1e3:.0f} kB) in {time.time() - t0:.0f}s")
    print(f"  status: {status}")
    return network
