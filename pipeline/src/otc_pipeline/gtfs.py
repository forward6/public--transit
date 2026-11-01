"""Import a GTFS feed (ideally OC Transpo's own from late 2010) into the network format.

    uv run otc-pipeline network --gtfs data/raw/archive/octranspo_20101125.zip

Picks the service running on the snapshot date (Wednesday 1 December 2010, or the closest
weekday the feed covers), groups trips into stop patterns, keeps every departure, and derives
AM-peak running times and dwells from stop_times. Shapes come from shapes.txt when present,
otherwise they are routed on the 2010 street + Transitway graph.
"""

from __future__ import annotations

import csv
import io
import statistics
import zipfile
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import numpy as np
from shapely.geometry import LineString, Point

from . import config

ROUTE_COLORS = {"transitway": "#D7263D", "otrain": "#25965A", "frequent": "#2856B8", "local": "#8794AB",
                "peak": "#6E7FA0", "rural": "#9A8C7A", "sto": "#0B97A3"}
AM_PEAK = (7 * 3600, 9 * 3600)


def _read(z: zipfile.ZipFile, name: str) -> list[dict]:
    if name not in z.namelist():
        return []
    with z.open(name) as f:
        return list(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")))


def _secs(hms: str) -> int | None:
    if not hms:
        return None
    h, m, s = (int(x) for x in hms.strip().split(":"))
    return h * 3600 + m * 60 + s


def _ymd(s: str) -> date:
    return date(int(s[:4]), int(s[4:6]), int(s[6:8]))


def active_services(calendar: list[dict], calendar_dates: list[dict], target: date) -> tuple[set[str], date]:
    """Service ids running on ``target`` (or the closest weekday with service, searching ±60 days)."""
    days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    for offset in [0] + [d for k in range(1, 61) for d in (k, -k)]:
        day = target + timedelta(days=offset)
        if day.weekday() >= 5:
            continue
        ids = {c["service_id"] for c in calendar
               if c.get(days[day.weekday()]) == "1" and _ymd(c["start_date"]) <= day <= _ymd(c["end_date"])}
        for cd in calendar_dates:
            if _ymd(cd["date"]) == day:
                (ids.add if cd["exception_type"] == "1" else ids.discard)(cd["service_id"])
        if ids:
            return ids, day
    raise ValueError("feed has no weekday service within 60 days of the snapshot")


def classify(route: dict, deps: list[int], uses_transitway: bool, agency: str) -> str:
    rtype = route.get("route_type", "3")
    if rtype in ("0", "1", "2"):
        return "otrain"
    if agency == "sto":
        return "sto"
    midday = [d for d in deps if 10 * 3600 <= d < 15 * 3600]
    peak = [d for d in deps if AM_PEAK[0] <= d < AM_PEAK[1]]
    if not midday and peak:
        return "peak"
    if uses_transitway:
        return "transitway"
    if len(peak) >= 8:  # every 15 min or better in both peak hours
        return "frequent"
    return "local"


def import_gtfs(path: str, bus_graph, target: date | None = None, station_lookup: dict | None = None):
    target = target or date.fromisoformat(config.SNAPSHOT_DATE)
    z = zipfile.ZipFile(path)
    agencies = _read(z, "agency.txt")
    routes = {r["route_id"]: r for r in _read(z, "routes.txt")}
    trips = _read(z, "trips.txt")
    stops = {s["stop_id"]: s for s in _read(z, "stops.txt")}
    services, day = active_services(_read(z, "calendar.txt"), _read(z, "calendar_dates.txt"), target)
    trips = [t for t in trips if t["service_id"] in services]
    trip_ids = {t["trip_id"] for t in trips}

    times: dict[str, list[tuple[int, str, int | None, int | None]]] = defaultdict(list)
    for st in _read(z, "stop_times.txt"):
        if st["trip_id"] in trip_ids:
            times[st["trip_id"]].append((int(st["stop_sequence"]), st["stop_id"], _secs(st["arrival_time"]), _secs(st["departure_time"])))
    shapes: dict[str, list[tuple[int, float, float]]] = defaultdict(list)
    for sp in _read(z, "shapes.txt"):
        shapes[sp["shape_id"]].append((int(sp["shape_pt_sequence"]), float(sp["shape_pt_lon"]), float(sp["shape_pt_lat"])))

    agency_name = (agencies[0].get("agency_name", "") if agencies else "").lower()
    agency = "sto" if ("outaouais" in agency_name or agency_name.startswith("sto")) else "octranspo"
    prefix = "sto" if agency == "sto" else "oct"

    # group trips into patterns ----------------------------------------------------------------
    groups: dict[tuple, list[tuple[dict, list]]] = defaultdict(list)
    for t in trips:
        st = sorted(times.get(t["trip_id"], []))
        if len(st) < 2:
            continue
        key = (t["route_id"], t.get("direction_id", "0") or "0", tuple(s[1] for s in st))
        groups[key].append((t, st))

    out_routes: dict[str, dict] = {}
    out_patterns: list[dict] = []
    used_stops: set[str] = set()
    for n, ((route_id, direction, seq), members) in enumerate(sorted(groups.items(), key=lambda kv: (kv[0][0], kv[0][1], -len(kv[1])))):
        r = routes[route_id]
        rid = f"{prefix}-{r.get('route_short_name') or route_id}"
        pid = f"{rid}-{direction}-{n}"
        deps = sorted(st[0][3] or st[0][2] for _, st in members)
        sample = [m for m in members if AM_PEAK[0] <= (m[1][0][3] or 0) < AM_PEAK[1]] or members
        k = len(seq)
        run = [statistics.median([(st[i + 1][2] or st[i + 1][3]) - (st[i][3] or st[i][2]) for _, st in sample]) for i in range(k - 1)]
        dwell = [statistics.median([max(0, (st[i][3] or 0) - (st[i][2] or 0)) for _, st in sample]) for i in range(k)]
        shape_id = members[0][0].get("shape_id")
        if shape_id and shapes.get(shape_id):
            coords = np.array([(x, y) for _, x, y in sorted(shapes[shape_id])])
        else:
            from .network2010 import path_coords
            nodes = [bus_graph.nearest_node(float(stops[s]["stop_lon"]), float(stops[s]["stop_lat"]))[0] for s in seq]
            coords = path_coords([e for a, b in zip(nodes, nodes[1:]) for e in bus_graph.path(a, b)])
        line = LineString(coords)
        dist, last = [], 0.0
        for s in seq:
            d = line.project(Point(float(stops[s]["stop_lon"]), float(stops[s]["stop_lat"])))
            last = max(last, d)
            dist.append(last)
        scale = _metres_per_degree(coords)
        out_patterns.append({
            "id": pid, "routeId": rid, "direction": int(direction), "headsign": members[0][0].get("trip_headsign") or stops[seq[-1]]["stop_name"],
            "stops": [f"{prefix}:{s}" for s in seq], "stopDist": [round(d * scale, 1) for d in dist],
            "shape": [[round(x, 6), round(y, 6)] for x, y in coords], "runTimes": [round(float(v), 1) for v in run],
            "dwell": [round(float(v), 1) for v in dwell],
        })
        used_stops.update(seq)
        rt = out_routes.setdefault(rid, {
            "id": rid, "agency": agency, "shortName": r.get("route_short_name") or route_id,
            "longName": r.get("route_long_name") or "", "mode": "rail" if r.get("route_type") in ("0", "1", "2") else "bus",
            "class": "local", "color": "", "patterns": [], "departures": {}, "_deps": [], "_tw": False,
            "provenance": {"source": f"GTFS {Path(path).name}, service of {day.isoformat()}", "confidence": "high", "verified": True},
        })
        rt["patterns"].append(pid)
        rt["departures"][pid] = deps
        rt["_deps"] += deps
        rt["_tw"] |= sum(1 for s in seq if "transitway" in stops[s]["stop_name"].lower() or (station_lookup or {}).get(s)) >= 3
    for rt in out_routes.values():
        rt["class"] = classify({"route_type": "2" if rt["mode"] == "rail" else "3"}, rt.pop("_deps"), rt.pop("_tw"), agency)
        rt["color"] = ROUTE_COLORS[rt["class"]]
        if rt["mode"] == "bus" and rt["class"] == "transitway":
            rt["mode"] = "brt"
    out_stops = [{"id": f"{prefix}:{s}", "name": stops[s]["stop_name"], "lon": round(float(stops[s]["stop_lon"]), 6),
                  "lat": round(float(stops[s]["stop_lat"]), 6),
                  "kind": "station" if stops[s].get("location_type") == "1" or "station" in stops[s]["stop_name"].lower() else "stop",
                  "agencies": [agency]} for s in sorted(used_stops)]
    print(f"  GTFS {Path(path).name}: service of {day}, {len(out_routes)} routes, {len(out_patterns)} patterns, {len(out_stops)} stops")
    return list(out_routes.values()), out_patterns, out_stops


def _metres_per_degree(coords: np.ndarray) -> float:
    """Shapely measures in degrees here; convert along-line distances to metres (mean scale)."""
    lat = float(np.mean(coords[:, 1]))
    dx, dy = np.diff(coords[:, 0]), np.diff(coords[:, 1])
    deg = np.hypot(dx, dy).sum()
    m = np.hypot(dx * 111_320 * np.cos(np.radians(lat)), dy * 110_950).sum()
    return float(m / deg) if deg > 0 else 1.0
