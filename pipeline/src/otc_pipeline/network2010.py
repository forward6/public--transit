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
import subprocess
import time
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq
import shapely
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components, dijkstra
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
SHARE_STOP_M = 250  # a route reuses another route's stop once it is this far past its own last stop
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
    name: str | None = None


class Graph:
    """Undirected network graph. Lines are split only where they share a vertex with another
    line (Overture connectors are shared vertices), so overpasses do not create false junctions."""

    def __init__(self, lines: list[np.ndarray], classes: list[str], names: list[str | None] | None = None):
        names = names or [None] * len(lines)
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

        for coords, keys, cls, name in zip(lines, keys_per_line, classes, names):
            if len(coords) < 2:
                continue
            cut = [0] + [i for i in range(1, len(coords) - 1) if int(keys[i]) in junction] + [len(coords) - 1]
            for a, b in zip(cut, cut[1:]):
                seg = coords[a:b + 1]
                L = line_len_m(seg)
                if L <= 0:
                    continue
                self.edges.append(Edge(nid(int(keys[a]), coords[a]), nid(int(keys[b]), coords[b]), seg, L, cls, name))
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
        self.matrix, self.best = self.weighted()
        self.edges_at: dict[int, list[int]] = {}
        for i, e in enumerate(self.edges):
            self.edges_at.setdefault(e.u, []).append(i)
            self.edges_at.setdefault(e.v, []).append(i)
        self.name_nodes: dict[str, set[int]] = {}
        for e in self.edges:
            if e.name:
                self.name_nodes.setdefault(e.name, set()).update((e.u, e.v))
        # main connected component: waypoints snap only to it, so islands never cause detours
        n = len(self.node_lonlat)
        if n:
            _, labels = connected_components(self.matrix, directed=False)
            main = np.flatnonzero(labels == np.bincount(labels).argmax())
            mx, my = to_m_xy(self.node_lonlat[main, 0], self.node_lonlat[main, 1])
            self.main_nodes = main
            self.main_tree = cKDTree(np.column_stack([mx, my]))

    def weighted(self, prefer: set[str] | frozenset = frozenset(), factor: float = 0.35,
                 class_factor: dict[str, float] | None = None):
        """Cost matrix (and best edge per node pair) — edges named in ``prefer`` cost ``factor`` x,
        and edges of a class in ``class_factor`` cost that much more (or less)."""
        class_factor = class_factor or {}
        n = len(self.node_lonlat)
        if not self.edges:
            return coo_matrix((0, 0)).tocsr(), {}
        best: dict[tuple[int, int], tuple[float, int]] = {}
        for i, e in enumerate(self.edges):
            w = e.length * COST.get(e.cls, 1.5) * (factor if e.name in prefer else 1.0) * class_factor.get(e.cls, 1.0)
            for a, b in ((e.u, e.v), (e.v, e.u)):
                if a == b:
                    continue
                if (a, b) not in best or w < best[(a, b)][0]:
                    best[(a, b)] = (w, i)
        rows = np.array([k[0] for k in best], dtype=np.int64)
        cols = np.array([k[1] for k in best], dtype=np.int64)
        data = np.array([v[0] for v in best.values()])
        return coo_matrix((data, (rows, cols)), shape=(n, n)).tocsr(), {k: v[1] for k, v in best.items()}

    def intersection(self, a: str, b: str, near: tuple[float, float] | None = None, max_gap_m: float = 60) -> int:
        """Node where streets ``a`` and ``b`` meet (closest to ``near`` if they meet more than once)."""
        na, nb = self.name_nodes.get(a, set()), self.name_nodes.get(b, set())
        if not na or not nb:
            raise KeyError(f"street not in graph: {a if not na else b!r}")
        main = set(self.main_nodes.tolist()) if getattr(self, "main_nodes", None) is not None else None
        if main is not None:
            na, nb = na & main, nb & main
        common = na & nb
        if not common:  # dual carriageways / ramps: closest pair of nodes within max_gap_m
            la, lb = sorted(na), sorted(nb)
            xa, ya = to_m_xy(self.node_lonlat[la, 0], self.node_lonlat[la, 1])
            xb, yb = to_m_xy(self.node_lonlat[lb, 0], self.node_lonlat[lb, 1])
            d, j = cKDTree(np.column_stack([xb, yb])).query(np.column_stack([xa, ya]))
            ok = np.flatnonzero(d <= max_gap_m)
            if not len(ok):
                raise KeyError(f"{a!r} and {b!r} do not meet")
            common = {la[i] for i in ok}
        if near is None or len(common) == 1:
            return min(common)
        nx, ny = to_m_xy(near[0], near[1])
        return min(common, key=lambda i: math.hypot(*(np.subtract(to_m_xy(*self.node_lonlat[i]), (nx, ny)))))

    def cross_name(self, node: int, street: str | None) -> str | None:
        """Name of another street meeting ``node`` (for naming stops 'Street / Cross')."""
        for e in self.edges_at.get(node, ()):
            n = self.edges[e].name
            if n and n != street and self.edges[e].cls not in ("busway", "link"):
                return n
        return None

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

    def link_parallel(self, cls: str = "busway", max_m: float = 35.0) -> int:
        """Cross-link parallel carriageways/tracks of ``cls`` (a 2010 busway was one two-way road;
        the LRT-derived geometry has two separate tracks joined only at their ends)."""
        nodes = sorted({n for e in self.edges if e.cls == cls for n in (e.u, e.v)})
        if not nodes:
            return 0
        adj = {n: {self.edges[e].v if self.edges[e].u == n else self.edges[e].u for e in self.edges_at.get(n, ())} for n in nodes}
        x, y = to_m_xy(self.node_lonlat[nodes, 0], self.node_lonlat[nodes, 1])
        tree = cKDTree(np.column_stack([x, y]))
        added = 0
        for a, b in tree.query_pairs(max_m):
            na, nb = nodes[a], nodes[b]
            if nb in adj[na]:
                continue
            c = np.array([self.node_lonlat[na], self.node_lonlat[nb]])
            self.edges.append(Edge(int(na), int(nb), c, max(line_len_m(c), 0.1), "busway", "Transitway"))
            added += 1
        return added

    def split_edges_near(self, lon: float, lat: float, cls: str = "busway", radius: float = 150.0,
                         min_len: float = 40.0) -> list[int]:
        """Split every ``cls`` edge passing within ``radius`` m of the point at its closest point.
        Returns the node at the split (or an existing end node if the closest point is an end)."""
        x, y = to_m_xy(lon, lat)
        out: list[int] = []
        for idx in range(len(self.edges)):
            e = self.edges[idx]
            if e.cls != cls or e.length < min_len:
                continue
            mx, my = to_m_xy(e.coords[:, 0], e.coords[:, 1])
            line = shapely.LineString(np.column_stack([mx, my]))
            if line.distance(Point(x, y)) > radius:
                continue
            d = line.project(Point(x, y))
            if d < 15 or d > line.length - 15:
                out.append(e.u if d < 15 else e.v)
                continue
            cut = shapely.line_interpolate_point(line, d)
            cum = np.concatenate([[0], np.cumsum(np.hypot(np.diff(mx), np.diff(my)))])
            k = int(np.searchsorted(cum, d))
            clon, clat = cut.x / KX + LON0, cut.y / KY + LAT0
            node = len(self.node_lonlat)
            self.node_lonlat = np.vstack([self.node_lonlat, [clon, clat]])
            first = np.vstack([e.coords[:k], [[clon, clat]]])
            second = np.vstack([[[clon, clat]], e.coords[k:]])
            self.edges[idx] = Edge(e.u, node, first, line_len_m(first), e.cls, e.name)
            self.edges.append(Edge(node, e.v, second, line_len_m(second), e.cls, e.name))
            out.append(node)
        if out:
            nx, ny = to_m_xy(self.node_lonlat[:, 0], self.node_lonlat[:, 1])
            self.tree = cKDTree(np.column_stack([nx, ny]))
        return out

    def _busway_components(self) -> dict[int, int]:
        parent: dict[int, int] = {}

        def find(i):
            while parent.setdefault(i, i) != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i
        for e in self.edges:
            if e.cls == "busway":
                parent[find(e.u)] = find(e.v)
        return {n: find(n) for n in parent}

    def link_station(self, lon: float, lat: float, radius: float = 180.0) -> int:
        """Station access: join the busway node nearest a station to the street nodes near it
        (2010 Transitway stations had ramps to the street). Returns links added; call rebuild()."""
        x, y = to_m_xy(lon, lat)
        near = self.tree.query_ball_point([float(x), float(y)], radius)
        if not near:
            return 0
        busway = set()
        street = set()
        for i in near:
            for e in self.edges_at.get(i, ()):
                (busway if self.edges[e].cls == "busway" else street).add(i)
        street -= busway
        if not busway:
            return 0
        nx, ny = to_m_xy(self.node_lonlat[:, 0], self.node_lonlat[:, 1])
        d = lambda i: math.hypot(nx[i] - x, ny[i] - y)  # noqa: E731
        b = min(busway, key=d)
        added = 0
        # corridor pieces meeting at this station (e.g. LRT-derived trunk and the SE busway at Hurdman)
        comp = self._busway_comp_cache if getattr(self, "_busway_comp_cache", None) else self._busway_components()
        self._busway_comp_cache = comp
        nearest_per_comp: dict[int, int] = {}
        for i in sorted(busway, key=d):
            nearest_per_comp.setdefault(comp.get(i, i), i)
        for other in nearest_per_comp.values():
            if comp.get(other, other) != comp.get(b, b):
                c = np.array([self.node_lonlat[b], self.node_lonlat[other]])
                self.edges.append(Edge(int(b), int(other), c, max(line_len_m(c), 0.1), "busway", "Transitway"))
                added += 1
        for s_ in sorted(street, key=d)[:2]:
            c = np.array([self.node_lonlat[b], self.node_lonlat[s_]])
            self.edges.append(Edge(int(b), int(s_), c, max(line_len_m(c), 0.1), "link"))
            added += 1
        return added

    def nearest_of_class(self, lon: float, lat: float, cls: str, radius: float = 300.0) -> int | None:
        """Nearest main-component node touching an edge of class ``cls`` within ``radius`` m."""
        x, y = to_m_xy(lon, lat)
        main = set(self.main_nodes.tolist())
        comp = self._busway_components() if cls == "busway" else {}
        sizes: dict[int, float] = {}  # total busway length per piece, metres
        for e in self.edges:
            if e.cls == "busway":
                c = comp.get(e.u, e.u)
                sizes[c] = sizes.get(c, 0.0) + e.length
        best = None
        for i in self.tree.query_ball_point([float(x), float(y)], radius):
            if i not in main or not any(self.edges[e].cls == cls for e in self.edges_at.get(i, ())):
                continue
            if comp and sizes.get(comp.get(i, i), 0) < 1500:  # skip station loops / stubs, snap to the trunk
                continue
            d = math.hypot(*np.subtract(to_m_xy(*self.node_lonlat[i]), (x, y)))
            if best is None or d < best[0]:
                best = (d, i)
        return None if best is None else int(best[1])

    def rebuild(self) -> None:
        self._build_matrix()

    def nearest_node(self, lon: float, lat: float, main: bool = True) -> tuple[int, float]:
        """Nearest node (in the main connected component unless ``main=False``)."""
        x, y = to_m_xy(lon, lat)
        if main and getattr(self, "main_tree", None) is not None:
            d, i = self.main_tree.query([float(x), float(y)])
            return int(self.main_nodes[i]), float(d)
        d, i = self.tree.query([float(x), float(y)])
        return int(i), float(d)

    def path(self, a: int, b: int, weights=None, limit: float = np.inf) -> list[Edge]:
        """Shortest path as a list of edges oriented a -> b (empty if a == b).

        ``limit`` bounds the search (in cost units, ~metres): much faster for nearby nodes."""
        if a == b:
            return []
        matrix, best = weights or (self.matrix, self.best)
        dist, pred = dijkstra(matrix, directed=True, indices=a, return_predecessors=True, limit=limit)
        if not np.isfinite(dist[b]):
            raise ValueError(f"no path between nodes {a} and {b}")
        seq = [b]
        while seq[-1] != a:
            seq.append(int(pred[seq[-1]]))
        seq.reverse()
        out = []
        for u, v in zip(seq, seq[1:]):
            e = self.edges[best[(u, v)]]
            coords = e.coords if (e.u, e.v) == (u, v) else e.coords[::-1]
            out.append(Edge(u, v, coords, e.length, e.cls, e.name))
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


def place_stations(infra: dict, corridors: dict[str, list[np.ndarray]], graph: "Graph | None" = None) -> list[dict]:
    pg, p = _read(config.RAW / "overture" / "transit_place.parquet")
    by_name: dict[str, list[tuple[float, Point]]] = {}
    for g, n, c in zip(pg, p["name"], p["confidence"]):
        if n:
            by_name.setdefault(n.lower(), []).append((c or 0, g))
    corridor_geom = {k: shapely.MultiLineString([ln.tolist() for ln in v]) for k, v in corridors.items() if v}
    out = []
    for st in infra["stations"]:
        pt = Point(st["at"]) if "at" in st else None
        for m in st.get("match", []) if pt is None else []:
            cands = by_name.get(m.lower())
            if cands:
                pt = max(cands, key=lambda c: c[0])[1]
                break
        if pt is None and "x" in st and graph is not None:
            pt = Point(graph.node_lonlat[graph.intersection(*st["x"])])
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
            "provenance": {"source": st.get("source", "Station position: Overture places (today's map); existence in 2010: curated"),
                           "confidence": st["confidence"], "verified": False, **({"note": st["note"]} if "note" in st else {})},
            "_corridors": st["corridors"], "_gtfs_match": st.get("gtfs_match", []),
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


STOP_SPACING_M = 420
FAST = {"busway", "motorway", "trunk", "link"}


def departures(periods: list[dict], direction: int) -> list[int]:
    """Departure times (s after midnight) from frequency periods; direction 1 offset by half a headway."""
    out = []
    for p in periods:
        h = p["headwayMin"] * 60
        t0 = _clock(p["from"]) + (h / 2 if direction else 0)
        t, end = t0, _clock(p["to"])
        while t < end:
            out.append(int(round(t)))
            t += h
    return sorted(set(out))


def _clock(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 3600 + int(m) * 60


def _waypoint(wp: str, graph: Graph, stations: dict[str, dict], near=None) -> tuple[int, str | None]:
    """'station-id' | 'A & B' (intersection) | '@lon,lat' -> (graph node, station id or None)."""
    if wp.startswith("@"):
        lon, lat = (float(v) for v in wp[1:].split(","))
        return graph.nearest_node(lon, lat)[0], None
    if " & " in wp:
        a, b = (x.strip() for x in wp.split(" & ", 1))
        return graph.intersection(a, b, near), None
    st = stations[wp]
    if "_node" in st:  # Transitway stations: their own node on the busway (see build_graphs)
        return st["_node"], wp
    if "transitway" in st.get("_corridors", ()):
        node = graph.nearest_of_class(st["lon"], st["lat"], "busway")
        if node is not None:
            return node, wp
    return graph.nearest_node(st["lon"], st["lat"])[0], wp


def build_bus_pattern(route: dict, pdef: dict, graph: Graph, weights, stations: dict[str, dict], pid: str,
                      direction: int, shared: dict[int, dict] | None = None) -> tuple[dict, list[dict]]:
    """Route a pattern through its waypoints; stations are stops, and street sections get stops
    every ~420 m named after the cross street. With ``shared`` (graph node -> stop), routes reuse
    each other's street stops. Returns (pattern, stops it created or reused)."""
    wps = pdef["path"]
    rapid = route.get("class") == "transitway"
    resolved = []
    prev = None
    for wp in wps:
        node, sid = _waypoint(wp, graph, stations, near=prev)
        resolved.append((node, sid))
        prev = tuple(graph.node_lonlat[node])
    resolved = [r for k, r in enumerate(resolved) if k == 0 or r[0] != resolved[k - 1][0]]
    if len(resolved) < 2:
        raise ValueError("all waypoints resolve to the same place")
    legs = [graph.path(a, b, weights) for (a, _), (b, _) in zip(resolved, resolved[1:])]
    edges = [e for leg in legs for e in leg]
    shape = path_coords(edges)
    # walk the path, emitting stops
    stops: list[tuple[str, float]] = []  # (stop id, distance along)
    new_stops: list[dict] = []
    acc = 0.0
    since = 0.0

    def add_generated(node: int, street: str | None, at: float):
        if shared is not None and node in shared:
            st = shared[node]
            if route["agency"] not in st["agencies"]:
                st["agencies"].append(route["agency"])
        else:
            cross = graph.cross_name(node, street)
            name = f"{street} / {cross}" if street and cross else (street or "Stop")
            sid = f"s{node}" if shared is not None else f"{pid}-s{len(new_stops)}"
            lon, lat = graph.node_lonlat[node]
            st = {"id": sid, "name": name, "lon": round(float(lon), 6), "lat": round(float(lat), 6),
                  "kind": "stop", "agencies": [route["agency"]]}
            if shared is not None:
                shared[node] = st
        new_stops.append(st)
        stops.append((st["id"], at))

    first_node, first_sid = resolved[0]
    if first_sid:
        stops.append((first_sid, 0.0))
    else:
        add_generated(first_node, edges[0].name if edges else None, 0.0)
    for k, leg in enumerate(legs):
        for e in leg:
            acc += e.length
            since += e.length if e.cls not in FAST else 0
            station_leg = rapid and resolved[k][1] is not None and resolved[k + 1][1] is not None
            if not station_leg and e.cls not in FAST and (
                    (since >= route.get("stopSpacing", STOP_SPACING_M) and graph.cross_name(e.v, e.name))
                    or (shared is not None and since >= SHARE_STOP_M and e.v in shared)):
                add_generated(e.v, e.name, acc)
                since = 0.0
        node, sid = resolved[k + 1]
        if sid:
            if stops and stops[-1][1] > acc - 120 and not stations.get(stops[-1][0]):  # a generated stop just before a station
                stops.pop()
                new_stops.pop()
            stops.append((sid, acc))
            since = 0.0
        elif k == len(legs) - 1:
            if not stops or acc - stops[-1][1] > 60:
                add_generated(node, leg[-1].name if leg else None, acc)
    # run times between consecutive stops from the edge speeds
    cum = np.cumsum([0.0] + [e.length for e in edges])
    times = np.cumsum([0.0] + [path_time([e], "bus") for e in edges])
    t_at = lambda d: float(np.interp(d, cum, times))  # noqa: E731
    dist = [d for _, d in stops]
    run = [round(t_at(b) - t_at(a), 1) for a, b in zip(dist, dist[1:])]
    all_stops = stations | {s["id"]: s for s in new_stops}
    new_stops = [s for s in new_stops if s["id"] in {sid for sid, _ in stops}]
    dwell = [DWELL[all_stops[sid]["kind"]] for sid, _ in stops]
    dwell[0] = dwell[-1] = 0
    headsign = pdef.get("headsign") or all_stops[stops[-1][0]]["name"]
    pattern = {"id": pid, "routeId": route["id"], "direction": direction, "headsign": headsign,
               "stops": [sid for sid, _ in stops], "stopDist": [round(d, 1) for d in dist],
               "shape": [[round(x, 5), round(y, 5)] for x, y in shapely.simplify(shapely.LineString(shape), 0.00002).coords],
               "runTimes": run, "dwell": dwell}
    return pattern, new_stops


def build_bus_route(r: dict, graph: Graph, stations: dict[str, dict], weights=None,
                    shared: dict[int, dict] | None = None) -> tuple[dict, list[dict], list[dict]]:
    """A route definition (routes.json format) -> (route, patterns, stops). A pattern may give
    ``weekday_back`` for the return direction (peak-only routes run inbound AM, outbound PM)."""
    weights = weights or graph.weighted(set(r.get("streets", [])), 0.35)
    patterns, stops, deps = [], [], {}
    for i, pdef in enumerate(r["patterns"]):
        variants = [(pdef, 0)]
        if r.get("bidirectional", True):
            rev = {**pdef, "path": list(reversed(pdef["path"])), "headsign": pdef.get("headsign_back")}
            variants.append((rev, 1))
        for v, direction in variants:
            pid = f"{r['id']}-{i}{'ab'[direction]}"
            pat, new = build_bus_pattern(r, v, graph, weights, stations, pid, direction, shared)
            patterns.append(pat)
            stops += new
            deps[pid] = departures(pdef.get("weekday_back", pdef["weekday"]) if direction else pdef["weekday"], direction)
    route = {k: r[k] for k in ("id", "agency", "shortName", "longName", "mode", "class", "color") if k in r} | {
        "patterns": [p["id"] for p in patterns], "departures": deps,
        "weekday": r.get("summary") or r["patterns"][0]["weekday"],
        "provenance": _provenance(r["provenance"]),
    }
    return route, patterns, stops


def build_graphs(infra, roads_g, roads, rail_g, rail, seg_g, seg):
    """Corridors, the routable bus graph (streets + Transitway) and the rail graph, plus placed stations."""
    # corridors -----------------------------------------------------------------------------
    tw_lines = build_transitway(infra, seg_g, seg, roads_g, roads)
    ot_lines = [ln for g, n, c in zip(rail_g, rail["name"], rail["class"]) if n == "O-Train" and c == "light_rail" for ln in _lines(g)]
    print(f"  transitway: {len(tw_lines)} pieces, {sum(line_len_m(l) for l in tw_lines) / 1000:.1f} km; "
          f"O-Train: {len(ot_lines)} pieces, {sum(line_len_m(l) for l in ot_lines) / 1000:.1f} km")

    # graphs ----------------------------------------------------------------------------------
    road_lines, road_cls, road_names = [], [], []
    for g, c, n in zip(roads_g, roads["class"], roads["name"]):
        for ln in _lines(g):
            road_lines.append(ln)
            road_cls.append(c)
            road_names.append(n)
    bus = Graph(road_lines + tw_lines, road_cls + ["busway"] * len(tw_lines), road_names + ["Transitway"] * len(tw_lines))
    links = bus.add_links(150)
    bus.rebuild()
    links += bus.link_parallel("busway", 35)
    rail_graph = Graph(ot_lines, ["rail"] * len(ot_lines))
    print(f"  bus graph: {len(bus.node_lonlat):,} nodes, {len(bus.edges):,} edges ({links} links); rail graph: {len(rail_graph.edges)} edges")

    # stations -----------------------------------------------------------------------------------
    stations = place_stations(infra, {"transitway": tw_lines, "otrain": ot_lines}, bus)
    access = 0
    for st in stations:
        if "transitway" not in st["_corridors"]:
            continue
        nodes = sorted(set(bus.split_edges_near(st["lon"], st["lat"], "busway", 150)),
                       key=lambda i: math.hypot(*np.subtract(to_m_xy(*bus.node_lonlat[i]), to_m_xy(st["lon"], st["lat"]))))
        if nodes:
            st["_node"] = int(nodes[0])
            for other in nodes[1:]:  # corridor pieces / tracks meeting at the station
                c = np.array([bus.node_lonlat[nodes[0]], bus.node_lonlat[other]])
                bus.edges.append(Edge(int(nodes[0]), int(other), c, max(line_len_m(c), 0.1), "busway", "Transitway"))
                access += 1
    bus.rebuild()
    for st in stations:
        if "transitway" in st["_corridors"]:
            access += bus.link_station(st["lon"], st["lat"])
    bus.rebuild()
    print(f"  station access links: {access}")
    return tw_lines, ot_lines, bus, rail_graph, stations


# Archived feeds used by default, from the data/gtfs-2010 branch (written by .github/workflows/archive-2010.yml).
# No 2010 OC Transpo feed survives. The closest is August 2011, the last weeks of the network before the
# September 2011 restructuring, so its 17 August weekday stands in for 1 December 2010. STO's earliest
# (2016) post-dates the Rapibus, so STO stays approximated.
DEFAULT_FEEDS = [{"file": "octranspo_20110806.zip", "date": "2011-08-17"}]
DATA_BRANCH = "data/gtfs-2010"


def default_feeds() -> list[tuple[str, str]]:
    """(path, weekday) of the default feeds, extracted from the data branch when not already local."""
    out = []
    for f in DEFAULT_FEEDS:
        path = config.RAW / "archive" / f["file"]
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            try:
                subprocess.run(["git", "fetch", "-q", "origin", DATA_BRANCH], cwd=config.REPO, check=True, timeout=300)
                blob = subprocess.run(["git", "show", f"origin/{DATA_BRANCH}:{f['file']}"], cwd=config.REPO, check=True,
                                      capture_output=True, timeout=120).stdout
                path.write_bytes(blob)
            except (subprocess.SubprocessError, OSError) as e:
                print(f"  ! {f['file']}: not in {path.parent} and the {DATA_BRANCH} branch can't be fetched ({e}); "
                      f"those routes will be approximated")
                continue
        out.append((str(path), f["date"]))
    return out


def build_network(gtfs: str | list[str] | None = None, approximate: bool = True, gtfs_date: str | None = None,
                  use_default_feeds: bool = True) -> dict:
    t0 = time.time()
    cur = config.CURATION / "network2010"
    infra = json.loads((cur / "infrastructure.json").read_text())
    routes_def = json.loads((cur / "routes.json").read_text())
    roads_g, roads = _read(config.BUILD / "2010" / "roads.parquet")
    rail_g, rail = _read(config.BUILD / "2010" / "rail.parquet")
    seg_g, seg = _read(config.RAW / "overture" / "segment.parquet")

    tw_lines, ot_lines, bus, rail_graph, stations = build_graphs(infra, roads_g, roads, rail_g, rail, seg_g, seg)
    stops = {s["id"]: s for s in stations}

    # routes ---------------------------------------------------------------------------------------
    routes, patterns = [], []
    if gtfs:
        feeds = [(g, gtfs_date) for g in ([gtfs] if isinstance(gtfs, str) else gtfs)]
    else:
        feeds = default_feeds() if use_default_feeds else []
    for feed, day in feeds:
        from .gtfs import import_gtfs
        g_routes, g_patterns, g_stops = import_gtfs(feed, bus, date.fromisoformat(day) if day else None,
                                                    stations=stations, rail_graph=rail_graph)
        routes += g_routes
        patterns += g_patterns
        stops.update({s["id"]: s for s in g_stops})
    # a feed's own routes replace the hand-reconstructed ones with the same id
    from_feed = {r["id"] for r in routes}
    station_stops = dict(stops)
    shared: dict[int, dict] = {}  # street stops, shared between routes
    for r in routes_def["routes"]:
        if r["id"] in from_feed:
            print(f"  route {r['shortName']}: from GTFS (replaces the reconstruction)")
            continue
        if r["mode"] != "rail":
            route, pats, new_stops = build_bus_route(r, bus, station_stops, shared=shared)
            routes.append(route)
            patterns += pats
            stops.update({s["id"]: s for s in new_stops})
            print(f"  route {r['shortName']}: {len(pats)} patterns, {sum(len(p['stops']) for p in pats)} stop calls, "
                  f"{sum(len(v) for v in route['departures'].values())} trips")
            continue
        graph = rail_graph
        pats = build_patterns(r, graph, stops, r["mode"])
        patterns += pats
        routes.append({k: r[k] for k in ("id", "agency", "shortName", "longName", "mode", "class", "color") if k in r}
                      | {"patterns": [p["id"] for p in pats], "weekday": r.get("weekday"),
                         "provenance": _provenance(r["provenance"]),
                         **({"longName_fr": r["longName_fr"]} if "longName_fr" in r else {})})

    # the rest of the 2010 catalogue, approximated (approx.py) ---------------------------------------
    cat_path = config.BUILD / "2010" / "route_catalogue.json"
    n_approx = 0
    if cat_path.exists() and approximate:
        from .approx import WEIGHTS, approx_routes, load_gazetteer
        defs, skipped = approx_routes(json.loads(cat_path.read_text()), load_gazetteer(stations), {r["id"] for r in routes})
        weights = {k: bus.weighted(class_factor=f) for k, f in WEIGHTS.items()}
        for r in defs:
            try:
                route, pats, new_stops = build_bus_route(r, bus, station_stops, weights[r.pop("weights")], shared)
            except ValueError as e:
                skipped.append({"id": r["id"], "why": str(e)})
                continue
            routes.append(route)
            patterns += pats
            stops.update({s["id"]: s for s in new_stops})
            n_approx += 1
        config.REPORTS.mkdir(parents=True, exist_ok=True)
        (config.REPORTS / "approx_routes.json").write_text(json.dumps(
            {"built": [r["id"] for r in defs if r["id"] in {x["id"] for x in routes}], "skipped": skipped}, indent=1,
            ensure_ascii=False))
        print(f"  approximate routes: {n_approx} built, {len(skipped)} skipped (see data/reports/approx_routes.json)")
    used = {s for p in patterns for s in p["stops"]}
    stops = {k: v for k, v in stops.items() if k in used or v["kind"] == "station"}

    has_bus = any(r["mode"] != "rail" for r in routes)
    status = "gtfs" if feeds else ("archive-reconstruction" if has_bus else "infrastructure-only")
    note = {
        "gtfs": "OC Transpo service from its own timetable (GTFS " + ", ".join(
                    f"{Path(f).name}, weekday of {d}" if d else Path(f).name for f, d in feeds)
                + "), preserved by the Internet Archive. No 2010 feed survives; this is the closest, the network "
                  "just before the September 2011 restructuring. Routes it lacks, and all STO routes, are "
                  "approximated from the November 2010 route tables. See the provenance of each route.",
        "archive-reconstruction": "2010 routes reconstructed from dated archive sources (Wikipedia revisions from late 2010: "
                                  "route tables, route articles, Transitway station lists). Routes with a route-level source "
                                  "follow it; the rest are approximated between the places the 2010 route table lists, with "
                                  "service typical of their fare class. See the provenance of each route.",
        "infrastructure-only": "Transitway corridor, stations and the original O-Train only. The 2010 bus routes will be "
                               "loaded from archived sources (OC Transpo GTFS / system maps) once they are reachable.",
    }[status]
    catalogue = []
    if cat_path.exists():
        mapped = {r["id"] for r in routes}
        for e in json.loads(cat_path.read_text()):
            rid = f"{'oct' if e['agency'] == 'octranspo' else 'sto'}-{e['number']}"
            catalogue.append(e | {"mapped": rid in mapped, "routeId": rid if rid in mapped else None})
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
        "catalogue": catalogue,
    }
    out = config.WEB_DATA / OUTPUT
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(network, separators=(",", ":"), ensure_ascii=False))
    print(f"  {len(network['stops'])} stops, {len(routes)} routes, {len(patterns)} patterns -> "
          f"{out.relative_to(config.REPO)} ({out.stat().st_size / 1e3:.0f} kB) in {time.time() - t0:.0f}s")
    print(f"  status: {status}")
    return network
