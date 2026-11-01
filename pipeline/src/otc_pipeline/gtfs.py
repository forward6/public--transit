"""Import a GTFS feed (ideally OC Transpo's or STO's own from late 2010) into the network format.

    uv run otc-pipeline network --gtfs data/raw/archive/octranspo_20101125.zip [--gtfs sto_….zip]

* Picks the service running on the snapshot date (Wednesday 1 December 2010, or the closest
  weekday the feed covers) and keeps every departure.
* Groups trips into stop patterns. AM-peak running times and dwells come from stop_times, with
  blank (non-timepoint) times interpolated by distance.
* Shapes come from shapes.txt when present. Otherwise they are routed on the 2010 street +
  Transitway graph (rail on the rail graph), with a bounded search and a cache.
* Platforms of the curated Transitway / O-Train stations ("HURDMAN 2A") become those stations,
  so departure boards and the map show one station, not a cloud of platforms.
* ALL-CAPS stop names become title case ("TUNNEY'S PASTURE 1A" -> "Tunney's Pasture 1A").
"""

from __future__ import annotations

import csv
import io
import math
import re
import statistics
import unicodedata
import zipfile
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

import numpy as np
from shapely.geometry import LineString

from . import config

ROUTE_COLORS = {"transitway": "#D7263D", "otrain": "#25965A", "frequent": "#2856B8", "local": "#8794AB",
                "peak": "#6E7FA0", "rural": "#9A8C7A", "sto": "#0B97A3"}
AM_PEAK = (7 * 3600, 9 * 3600)
STATION_RADIUS_M = 800  # "WALKLEY 2A" is unambiguous even where our station position is a little off
ALIAS_RADIUS_M = 300  # street-stop aliases ("ALBERT / BANK") must be close
DETOUR = 3.0  # a routed hop longer than DETOUR x the straight line (+800 m) is drawn straight instead


# ------------------------------------------------------------------------------------------ reading

def _iter(z: zipfile.ZipFile, name: str):
    if name not in z.namelist():
        return
    with z.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig", errors="replace"))


def _read(z: zipfile.ZipFile, name: str) -> list[dict]:
    return list(_iter(z, name))


def _secs(hms: str | None) -> int | None:
    hms = (hms or "").strip()
    if not hms:
        return None
    h, m, s = (int(x) for x in hms.split(":"))
    return h * 3600 + m * 60 + s


def _ymd(s: str) -> date:
    return date(int(s[:4]), int(s[4:6]), int(s[6:8]))


def _xy(lon, lat):
    """Local metres (equirectangular at Ottawa's latitude): fine for distances under ~50 km."""
    return np.asarray(lon, float) * 111_320 * math.cos(math.radians(45.4)), np.asarray(lat, float) * 110_950


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


# ------------------------------------------------------------------------------------------ names & stations

def nice_name(name: str) -> str:
    """ALL-CAPS GTFS names -> title case; names that already have lower case are kept."""
    name = (name or "").strip()
    if not name or name != name.upper():
        return name
    s = name.title()
    s = re.sub(r"(\w)'S\b", r"\1's", s)                                   # Tunney'S -> Tunney's
    s = re.sub(r"\bMc([a-z])", lambda m: "Mc" + m.group(1).upper(), s)     # Mcarthur -> McArthur
    s = re.sub(r"\b(\d+)([a-z])\b", lambda m: m.group(1) + m.group(2).upper(), s)  # 2a -> 2A
    s = re.sub(r"\bO-Train\b", "O-Train", s, flags=re.IGNORECASE)
    return s


def _words(s: str) -> list[str]:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().upper()
    return re.sub(r"[^A-Z0-9]+", " ", s).split()


_PLATFORM = re.compile(r"^(\d{1,2}[A-Z]?|[A-Z]\d?|STATION|STN|O TRAIN|OTRAIN|PLATFORM \w+|QUAI \w+)?$")


def match_stations(stops: dict[str, dict], stations: list[dict] | None,
                   radius_m: float = STATION_RADIUS_M) -> dict[str, str]:
    """GTFS stop id -> curated station id, for the station's own platforms.

    A platform is near the station and named after it, optionally followed by a platform code:
    "HURDMAN 2A", "O-TRAIN CARLETON N.", "Lincoln Fields station". Street stops near a station
    ("BASELINE / WOODROFFE") stay separate. Stations can list ``gtfs_match`` other names, which
    must be close (e.g. the downtown on-street stations: "ALBERT / BANK", "SLATER / BANK")."""
    if not stations:
        return {}
    sx, sy = _xy([s["lon"] for s in stations], [s["lat"] for s in stations])
    names = [[" ".join(_words(n)) for n in [s["name"], *s.get("gtfs_match", s.get("_gtfs_match", []))]]
             for s in stations]
    out = {}
    for sid, s in stops.items():
        try:
            x, y = _xy(float(s["stop_lon"]), float(s["stop_lat"]))
        except (KeyError, ValueError):
            continue
        name = " ".join(_words(s.get("stop_name", "")))
        name = name.removeprefix("O TRAIN ")
        best = None
        for i in np.flatnonzero(np.hypot(sx - x, sy - y) <= radius_m):
            d = math.hypot(sx[i] - x, sy[i] - y)
            ok = any(name.startswith(a) and _PLATFORM.match(name[len(a):].strip())
                     for k, a in enumerate(names[i]) if k == 0 or d <= ALIAS_RADIUS_M)
            if ok and (best is None or d < best[0]):
                best = (d, stations[i]["id"])
        if best:
            out[sid] = best[1]
    return out


# ------------------------------------------------------------------------------------------ geometry & times

def forward_project(shape_xy: np.ndarray, pts_xy: np.ndarray, ahead_penalty: float = 0.02) -> list[float]:
    """Distance along ``shape_xy`` of each point, in order and never backwards.

    Handles loops and out-and-back shapes: each stop is matched to the nearest part of the shape
    at or after the previous stop, with a small penalty for skipping far ahead."""
    if len(shape_xy) < 2:
        return [0.0] * len(pts_xy)
    a, d = shape_xy[:-1], np.diff(shape_xy, axis=0)
    seg = np.hypot(d[:, 0], d[:, 1])
    cum = np.concatenate([[0.0], np.cumsum(seg)])
    l2 = np.maximum(seg ** 2, 1e-9)
    out, cur = [], 0.0
    for p in pts_xy:
        t = np.clip(((p[0] - a[:, 0]) * d[:, 0] + (p[1] - a[:, 1]) * d[:, 1]) / l2, 0.0, 1.0)
        off = np.hypot(a[:, 0] + d[:, 0] * t - p[0], a[:, 1] + d[:, 1] * t - p[1])
        along = cum[:-1] + t * seg
        cost = np.where(along >= cur - 1e-6, off + ahead_penalty * (along - cur), np.inf)
        i = int(np.argmin(cost))
        if np.isfinite(cost[i]):
            cur = max(cur, float(along[i]))
        out.append(cur)
    return out


def fill_times(st: list[tuple], xy: dict[str, tuple[float, float]]) -> list[tuple[str, int, int]] | None:
    """[(seq, stop, arr, dep)] with blanks -> [(stop, arr, dep)], blanks interpolated by distance."""
    n = len(st)
    arr = [s[2] if s[2] is not None else s[3] for s in st]
    dep = [s[3] if s[3] is not None else s[2] for s in st]
    known = [i for i in range(n) if arr[i] is not None]
    if len(known) < 2:
        return None
    cum = [0.0]
    for (_, s1, *_), (_, s2, *_) in zip(st, st[1:]):
        (x1, y1), (x2, y2) = xy.get(s1, (0, 0)), xy.get(s2, (0, 0))
        cum.append(cum[-1] + math.hypot(x2 - x1, y2 - y1))
    for i, j in zip(known, known[1:]):
        span = cum[j] - cum[i]
        for k in range(i + 1, j):
            f = (cum[k] - cum[i]) / span if span > 0 else (k - i) / (j - i)
            arr[k] = dep[k] = round(dep[i] + f * (arr[j] - dep[i]))
    for k in range(known[0]):
        arr[k] = dep[k] = arr[known[0]]
    for k in range(known[-1] + 1, n):
        arr[k] = dep[k] = dep[known[-1]]
    return [(s[1], arr[k], dep[k]) for k, s in enumerate(st)]


def classify(route: dict, deps: list[int], uses_transitway: bool, agency: str) -> str:
    """``deps``: departures in the route's busiest direction."""
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
    if len(peak) >= 8:  # every 15 min or better through the AM peak
        return "frequent"
    return "local"


# ------------------------------------------------------------------------------------------ import

def _routed_shape(seq: list[str], stops: dict, graph, cache: dict) -> np.ndarray:
    """Route a pattern through its stops on ``graph`` (bounded searches, cached per stop pair)."""
    from .network2010 import path_coords
    nodes = [graph.nearest_node(float(stops[s]["stop_lon"]), float(stops[s]["stop_lat"]))[0] for s in seq]
    parts = []
    for s1, s2, a, b in zip(seq, seq[1:], nodes, nodes[1:]):
        key = (a, b)
        if key not in cache:
            x1, y1 = _xy(float(stops[s1]["stop_lon"]), float(stops[s1]["stop_lat"]))
            x2, y2 = _xy(float(stops[s2]["stop_lon"]), float(stops[s2]["stop_lat"]))
            straight = math.hypot(float(x2 - x1), float(y2 - y1))
            try:
                c = path_coords(graph.path(a, b, limit=DETOUR * straight + 800))
            except ValueError:  # no street path of a sensible length (e.g. streets built after 2010)
                c = np.zeros((0, 2))
            cache[key] = c
        c = cache[key]
        if len(c) < 2:  # unroutable: a straight hop between the stops
            c = np.array([[float(stops[s]["stop_lon"]), float(stops[s]["stop_lat"])] for s in (s1, s2)])
        parts.append(c if not parts else c[1:])
    return np.concatenate(parts) if parts else np.zeros((0, 2))


def import_gtfs(path: str, bus_graph, target: date | None = None, stations: list[dict] | None = None,
                rail_graph=None):
    """GTFS zip -> (routes, patterns, stops) in the network format. ``stops`` excludes curated stations."""
    target = target or date.fromisoformat(config.SNAPSHOT_DATE)
    z = zipfile.ZipFile(path)
    agencies = _read(z, "agency.txt")
    routes = {r["route_id"]: r for r in _read(z, "routes.txt")}
    stops = {s["stop_id"]: s for s in _read(z, "stops.txt")}
    services, day = active_services(_read(z, "calendar.txt"), _read(z, "calendar_dates.txt"), target)
    trips = [t for t in _iter(z, "trips.txt") if t["service_id"] in services]
    trip_ids = {t["trip_id"] for t in trips}

    times: dict[str, list[tuple]] = defaultdict(list)
    for st in _iter(z, "stop_times.txt"):  # streamed: a full city's stop_times is millions of rows
        if st["trip_id"] in trip_ids:
            times[st["trip_id"]].append((int(st["stop_sequence"]), st["stop_id"], _secs(st.get("arrival_time")),
                                         _secs(st.get("departure_time"))))
    shape_ids = {t.get("shape_id") for t in trips if t.get("shape_id")}
    shapes: dict[str, list[tuple[int, float, float]]] = defaultdict(list)
    for sp in _iter(z, "shapes.txt"):
        if sp["shape_id"] in shape_ids:
            shapes[sp["shape_id"]].append((int(sp["shape_pt_sequence"]), float(sp["shape_pt_lon"]), float(sp["shape_pt_lat"])))

    agency_name = (agencies[0].get("agency_name", "") if agencies else "").lower()
    agency = "sto" if ("outaouais" in agency_name or agency_name.startswith("sto")) else "octranspo"
    prefix = "sto" if agency == "sto" else "oct"
    to_station = match_stations(stops, stations)
    snapshot = date.fromisoformat(config.SNAPSHOT_DATE)
    same_era = abs((day - snapshot).days) <= 60
    provenance = {"source": f"GTFS {Path(path).name}, service of {day.isoformat()}",
                  "confidence": "high" if same_era else "medium", "verified": same_era,
                  **({} if same_era else {"note": f"The agency's own timetable of {day.isoformat()}, standing in for "
                                                   f"{config.SNAPSHOT_DATE} (the closest preserved feed)."})}
    xy = {sid: tuple(float(v) for v in _xy(float(s["stop_lon"]), float(s["stop_lat"]))) for sid, s in stops.items()
          if s.get("stop_lon") and s.get("stop_lat")}

    # group trips into patterns ----------------------------------------------------------------
    groups: dict[tuple, list[tuple[dict, list]]] = defaultdict(list)
    skipped = 0
    for t in trips:
        filled = fill_times(sorted(times.get(t["trip_id"], [])), xy)
        if not filled or len(filled) < 2:
            skipped += 1
            continue
        key = (t["route_id"], t.get("direction_id", "0") or "0", tuple(s[0] for s in filled))
        groups[key].append((t, filled))

    out_routes: dict[str, dict] = {}
    out_patterns: list[dict] = []
    used_stops: set[str] = set()
    route_cache: dict = {}
    ordered = sorted(groups.items(), key=lambda kv: (kv[0][0], kv[0][1], -len(kv[1])))
    for n, ((route_id, direction, seq), members) in enumerate(ordered):
        r = routes[route_id]
        rail = r.get("route_type") in ("0", "1", "2")
        short = (r.get("route_short_name") or route_id).strip()
        rid = "oct-otrain" if rail and agency == "octranspo" else f"{prefix}-{short}"
        pid = f"{rid}-{direction}-{n}"
        deps = sorted(st[0][2] for _, st in members)
        sample = [m for m in members if AM_PEAK[0] <= m[1][0][2] < AM_PEAK[1]] or members
        k = len(seq)
        run = [max(5.0, statistics.median([st[i + 1][1] - st[i][2] for _, st in sample])) for i in range(k - 1)]
        dwell = [statistics.median([max(0, st[i][2] - st[i][1]) for _, st in sample]) for i in range(k)]

        shape_id = members[0][0].get("shape_id")
        if shape_id and len(shapes.get(shape_id, [])) >= 2:
            coords = np.array([(x, y) for _, x, y in sorted(shapes[shape_id])])
        else:
            graph = rail_graph if rail and rail_graph is not None else bus_graph
            coords = _routed_shape(list(seq), stops, graph, route_cache)
        if len(coords) < 2:
            coords = np.array([[float(stops[s]["stop_lon"]), float(stops[s]["stop_lat"])] for s in seq])
        coords = np.asarray(LineString(coords).simplify(0.00002).coords)  # ~2 m: keeps every street turn
        sx, sy = _xy(coords[:, 0], coords[:, 1])
        px, py = _xy([float(stops[s]["stop_lon"]) for s in seq], [float(stops[s]["stop_lat"]) for s in seq])
        dist = forward_project(np.column_stack([sx, sy]), np.column_stack([px, py]))

        headsign = nice_name(members[0][0].get("trip_headsign") or stops[seq[-1]]["stop_name"])
        out_patterns.append({
            "id": pid, "routeId": rid, "direction": int(direction), "headsign": headsign,
            "stops": [to_station.get(s, f"{prefix}:{s}") for s in seq], "stopDist": [round(d, 1) for d in dist],
            "shape": [[round(x, 6), round(y, 6)] for x, y in coords], "runTimes": [round(float(v), 1) for v in run],
            "dwell": [round(float(v), 1) for v in dwell],
        })
        used_stops.update(s for s in seq if s not in to_station)
        rt = out_routes.setdefault(rid, {
            "id": rid, "agency": agency, "shortName": "O-Train" if rid == "oct-otrain" else short,
            "longName": nice_name(r.get("route_long_name") or ""), "mode": "rail" if rail else "bus",
            "class": "local", "color": "", "patterns": [], "departures": {},
            "_deps": defaultdict(list), "_heads": defaultdict(Counter), "_tw": False,
            "provenance": provenance,
        })
        rt["patterns"].append(pid)
        rt["departures"][pid] = deps
        rt["_deps"][direction] += deps
        rt["_heads"][direction][headsign] += len(members)
        # a Transitway route runs station to station for a good part of its trip (feeders only touch stations)
        hops = sum(1 for a, b in zip(seq, seq[1:]) if a in to_station and b in to_station and to_station[a] != to_station[b])
        rt["_tw"] |= hops >= 3 and hops >= 0.25 * (len(seq) - 1)

    for rt in out_routes.values():
        by_dir = rt.pop("_deps")
        busiest = max(by_dir.values(), key=len) if by_dir else []
        rt["class"] = classify({"route_type": "2" if rt["mode"] == "rail" else "3"}, busiest, rt.pop("_tw"), agency)
        rt["color"] = ROUTE_COLORS[rt["class"]]
        heads: Counter = sum(rt.pop("_heads").values(), Counter())
        if not rt["longName"]:  # e.g. OC Transpo's feeds leave it blank (and have no direction_id)
            rt["longName"] = " ↔ ".join(h for h, _ in heads.most_common(2))
        if rt["mode"] == "bus" and rt["class"] == "transitway":
            rt["mode"] = "brt"
    out_stops = [{"id": f"{prefix}:{s}", "name": nice_name(stops[s]["stop_name"]), "lon": round(float(stops[s]["stop_lon"]), 6),
                  "lat": round(float(stops[s]["stop_lat"]), 6),
                  "kind": "station" if stops[s].get("location_type") == "1" else "stop",
                  "agencies": [agency]} for s in sorted(used_stops)]
    print(f"  GTFS {Path(path).name}: service of {day}, {len(out_routes)} routes, {len(out_patterns)} patterns, "
          f"{sum(len(v) for r in out_routes.values() for v in r['departures'].values())} trips, {len(out_stops)} stops, "
          f"{len(set(to_station.values()))} stations matched ({len(to_station)} platforms)"
          + (f", {skipped} trips without times skipped" if skipped else ""))
    return list(out_routes.values()), out_patterns, out_stops
