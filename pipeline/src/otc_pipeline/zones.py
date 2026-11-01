"""Demand zones, residents and jobs for the 2011 base year, and car travel times (M3).

    uv run otc-pipeline zones

There are no census dissemination areas in the build yet, so OTC places people where the 2010
buildings are. It's a game: "right enough" is the aim, and every estimate is labelled in
``curation/demand2011/targets.json``.

* **Zones** are H3 cells at resolution 8 (about 0.74 km²) where people live or work. Cells with
  little activity merge into their resolution-7 parent (about 5 km²).
* **Residents** come from residential floor space. A house is one dwelling; terraces and
  apartments are counted by floor area. The totals are scaled to the 2011 census population of
  Ottawa and of Gatineau.
* **Jobs** come from non-residential floor space by type (office, retail, institutional,
  industrial), at a typical floor area per job, scaled to the employment totals. Buildings with
  no class take one from the land use around them.
* **Segments**: workers, post-secondary students, school pupils and others, each with or without
  a car. Households in dense areas are less likely to have a car.
* **Car times** between zones use the 2010 road graph at typical AM-peak speeds (minutes,
  one byte each).

Output: ``apps/web/public/data/zones-2011.json`` and ``apps/web/public/data/car-2011.bin``.
"""

from __future__ import annotations

import json
import math
import time
from collections import defaultdict

import h3
import numpy as np
import pyarrow.parquet as pq
import shapely
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
from shapely.strtree import STRtree

from . import config
from .network2010 import DOWNTOWN, Graph, _lines

RES, RES_SPARSE = 8, 7
MIN_ACTIVITY = 250  # residents + jobs below which a cell merges into its parent
PARLIAMENT = (-75.6990, 45.4236)

# building class -> kind
RESIDENTIAL = {"detached": "house", "house": "house", "bungalow": "house", "farm": "house", "cabin": "house",
               "semidetached_house": "terrace", "terrace": "terrace", "static_caravan": "house",
               "residential": "flats", "apartments": "flats", "dormitory": "flats"}
JOB_KIND = {"commercial": "office", "office": "office", "civic": "office", "public": "office", "government": "office",
            "bank": "office", "hotel": "hotel", "retail": "retail", "supermarket": "retail", "kiosk": "retail",
            "school": "school", "kindergarten": "school", "university": "university", "college": "university",
            "hospital": "hospital", "church": "civic", "library": "civic", "fire_station": "civic",
            "post_office": "civic", "train_station": "civic", "transportation": "civic", "religious": "civic",
            "industrial": "industrial", "warehouse": "industrial", "service": "industrial", "hangar": "industrial",
            "manufacture": "industrial"}
# floor area (m²) per job, by kind; job sector each kind reports to
M2_PER_JOB = {"office": 28, "hotel": 70, "retail": 45, "school": 90, "university": 60, "hospital": 35, "civic": 80,
              "industrial": 110}
SECTOR = {"office": "office", "hotel": "retail", "retail": "retail", "school": "institutional",
          "university": "institutional", "hospital": "institutional", "civic": "institutional",
          "industrial": "industrial"}
PERSONS = {"house": 2.7, "terrace": 2.4, "flats": 1.8}  # per dwelling (relative; scaled to the census)
LANDUSE_KIND = {"residential": "res", "commercial": "office", "retail": "retail", "industrial": "industrial",
                "school": "school", "university": "university", "college": "university", "hospital": "hospital",
                "military": "office"}
# AM-peak car speeds, km/h
CAR_KMH = {"motorway": 72, "trunk": 55, "primary": 38, "secondary": 34, "tertiary": 30, "minor": 25,
           "service": 12, "link": 35}
DOWNTOWN_CAR_FACTOR = 0.55


def _xy_m(lon, lat):
    k = 111_320 * math.cos(math.radians(45.4))
    return np.asarray(lon) * k, np.asarray(lat) * 110_950


def _targets() -> dict:
    return json.loads((config.CURATION / "demand2011" / "targets.json").read_text())


def classify_buildings(cls: np.ndarray, footprint: np.ndarray, h: np.ndarray, landuse: list[str | None]):
    """-> (kind per building, floors). Kind is house/terrace/flats, a job kind, or '' (ignored)."""
    floors = np.maximum(1, np.round(h / 3.2))
    kinds = []
    for c, a, fl, lu in zip(cls, footprint, floors, landuse):
        if c in RESIDENTIAL:
            kinds.append(RESIDENTIAL[c])
        elif c in JOB_KIND:
            kinds.append(JOB_KIND[c])
        elif c:  # garages, sheds, barns, roofs, greenhouses...
            kinds.append("")
        else:  # no class: go by land use, then by size
            k = LANDUSE_KIND.get(lu or "")
            if k == "res" or (k is None and a < 300 and fl <= 3):
                kinds.append("house" if a < 250 and fl <= 2 else "flats")
            elif k:
                kinds.append(k)
            else:
                kinds.append("office" if fl >= 4 else ("" if a < 40 else "industrial" if a > 2000 else "retail"))
    return np.array(kinds, dtype=object), floors


def dwellings(kind: str, footprint: float, floors: float) -> float:
    if kind == "house":
        return 1.0 if footprint < 400 else footprint / 200
    if kind == "terrace":
        return max(1.0, footprint * floors / 130)
    return max(1.0, footprint * floors * 0.8 / 85)  # flats


def car_density_share(density_per_km2: float) -> float:
    """Share of residents without a car in the household, from residential density."""
    return 0.03 + 0.42 / (1 + math.exp(-(density_per_km2 - 7000) / 1800))


def build_zones() -> dict:
    t0 = time.time()
    tg = _targets()
    b = pq.read_table(config.BUILD / "2010" / "buildings.parquet")
    geoms = shapely.from_wkb(b["geometry"].to_numpy(zero_copy_only=False))
    h = b["h"].to_numpy()
    cls = np.array([c or "" for c in b["c"].to_pylist()], dtype=object)
    cent = shapely.centroid(geoms)
    lon, lat = shapely.get_x(cent), shapely.get_y(cent)
    kx = 111_320 * math.cos(math.radians(45.4))
    footprint = shapely.area(geoms) * kx * 110_950

    # land use under each unclassified building (Overture classes, today's map)
    lu_t = pq.read_table(config.RAW / "overture" / "land_use.parquet", columns=["geometry", "class"])
    lu_g = shapely.from_wkb(lu_t["geometry"].to_numpy(zero_copy_only=False))
    lu_c = lu_t["class"].to_pylist()
    keep = np.array([c in LANDUSE_KIND for c in lu_c])
    lu_g, lu_c = lu_g[keep], [c for c, k in zip(lu_c, keep) if k]
    landuse: list[str | None] = [None] * len(geoms)
    todo = np.flatnonzero(cls == "")
    pt_idx, poly_idx = STRtree(lu_g).query(cent[todo], predicate="within")
    for p, q in zip(pt_idx, poly_idx):
        landuse[todo[p]] = lu_c[q]
    kind, floors = classify_buildings(cls, footprint, h, landuse)

    # municipality
    da = pq.read_table(config.RAW / "overture" / "division_area.parquet")
    city_poly = {r["name"].lower(): shapely.from_wkb(g) for r, g in
                 zip(da.drop(["geometry"]).to_pylist(), da["geometry"].to_pylist()) if r["name"] in ("Ottawa", "Gatineau")}
    for p in city_poly.values():
        shapely.prepare(p)
    city = np.full(len(geoms), "", dtype=object)
    for name, poly in city_poly.items():
        city[shapely.contains(poly, cent)] = name

    # raw residents and jobs per building
    res = np.zeros(len(geoms))
    jobs = defaultdict(lambda: np.zeros(len(geoms)))
    enrol_post = np.zeros(len(geoms))
    enrol_school = np.zeros(len(geoms))
    for i, (k, a, fl) in enumerate(zip(kind, footprint, floors)):
        if not k or not city[i]:
            continue
        if k in PERSONS:
            res[i] = dwellings(k, a, fl) * PERSONS[k]
        else:
            area = a * fl * 0.85
            jobs[SECTOR[k]][i] = area / M2_PER_JOB[k]
            if k == "university":
                enrol_post[i] = area
            elif k == "school":
                enrol_school[i] = area

    # scale to the 2011 controls, per city
    for name in ("ottawa", "gatineau"):
        m = city == name
        res[m] *= tg["population"][name]["value"] / max(res[m].sum(), 1)
        tot = sum(v[m].sum() for v in jobs.values())
        for v in jobs.values():
            v[m] *= tg["jobs"][name]["value"] / max(tot, 1)
    enrol_post *= tg["enrolment"]["post_secondary"]["value"] / max(enrol_post.sum(), 1)
    enrol_school *= tg["enrolment"]["school_share_of_population"]["value"] * res.sum() / max(enrol_school.sum(), 1)

    # aggregate to H3 cells, then merge sparse cells into their parents
    cells = [h3.latlng_to_cell(y, x, RES) for x, y in zip(lon, lat)]
    agg: dict[str, dict] = {}
    sectors = sorted(jobs)
    for i, c in enumerate(cells):
        if not city[i] or (res[i] == 0 and enrol_post[i] == 0 and enrol_school[i] == 0 and all(jobs[s][i] == 0 for s in sectors)):
            continue
        z = agg.setdefault(c, {"res": 0.0, "jobs": defaultdict(float), "post": 0.0, "school": 0.0, "wx": 0.0, "wy": 0.0,
                               "w": 0.0, "city": defaultdict(float), "area": 0.0})
        act = res[i] + sum(jobs[s][i] for s in sectors)
        z["res"] += res[i]
        for s in sectors:
            z["jobs"][s] += jobs[s][i]
        z["post"] += enrol_post[i]
        z["school"] += enrol_school[i]
        z["wx"] += lon[i] * act
        z["wy"] += lat[i] * act
        z["w"] += act
        z["city"][city[i]] += act + 1e-6
    zones_raw: dict[str, dict] = {}
    for c, z in agg.items():
        activity = z["res"] + sum(z["jobs"].values())
        key = c if activity >= MIN_ACTIVITY else h3.cell_to_parent(c, RES_SPARSE)
        tgt = zones_raw.setdefault(key, {"cells": [], "res": 0.0, "jobs": defaultdict(float), "post": 0.0, "school": 0.0,
                                         "wx": 0.0, "wy": 0.0, "w": 0.0, "city": defaultdict(float)})
        tgt["cells"].append(c)
        tgt["res"] += z["res"]
        for s, v in z["jobs"].items():
            tgt["jobs"][s] += v
        tgt["post"] += z["post"]
        tgt["school"] += z["school"]
        for k in ("wx", "wy", "w"):
            tgt[k] += z[k]
        for k, v in z["city"].items():
            tgt["city"][k] += v

    tr = tg["residents"]
    school_share = tg["enrolment"]["school_share_of_population"]["value"]
    out = []
    for key, z in sorted(zones_raw.items(), key=lambda kv: (-kv[1]["wy"] / max(kv[1]["w"], 1e-9), kv[0])):
        if z["res"] + sum(z["jobs"].values()) < 20:
            continue
        if z["w"] > 0:
            zl, zt = z["wx"] / z["w"], z["wy"] / z["w"]
        else:
            zt, zl = h3.cell_to_latlng(key)
        area_km2 = len(z["cells"]) * h3.average_hexagon_area(RES, "km^2")
        density = z["res"] / area_km2
        nocar = car_density_share(density)
        pop = z["res"]
        groups = {"worker": pop * tr["workers_share"]["value"], "post": pop * tr["post_secondary_share"]["value"],
                  "school": pop * school_share}
        groups["other"] = max(0.0, pop - sum(groups.values()))
        seg = {}
        for g, n in groups.items():
            seg[f"{g}_car"] = round(n * (1 - nocar), 1)
            seg[f"{g}_nocar"] = round(n * nocar, 1)
        city_name = max(z["city"], key=z["city"].get)
        dx, dy = _xy_m(zl - PARLIAMENT[0], zt - PARLIAMENT[1])
        dist_km = float(math.hypot(dx, dy)) / 1000
        downtown = DOWNTOWN.contains(shapely.Point(zl, zt))
        district = ("downtown" if downtown else
                    "hull" if city_name == "gatineau" and dist_km < 5 else
                    "gatineau" if city_name == "gatineau" else
                    "inner" if dist_km < 9 else
                    "suburbs" if density > 800 or sum(z["jobs"].values()) / area_km2 > 800 else "rural")
        out.append({
            "id": len(out), "cell": key, "lon": round(float(zl), 5), "lat": round(float(zt), 5),
            "areaKm2": round(area_km2, 2), "city": city_name, "district": district, "downtown": bool(downtown),
            "ring": [[round(lng, 5), round(la, 5)] for la, lng in h3.cell_to_boundary(key)],
            "pop": round(pop, 1), "seg": seg,
            "jobs": {s: round(v, 1) for s, v in sorted(z["jobs"].items())},
            "enrol": {"post": round(z["post"], 1), "school": round(z["school"], 1)},
        })
    print(f"  {len(out)} zones ({sum(1 for z in out if h3.get_resolution(z['cell']) == RES)} at res {RES}); "
          f"{sum(z['pop'] for z in out):,.0f} residents, {sum(sum(z['jobs'].values()) for z in out):,.0f} jobs, "
          f"{sum(z['enrol']['post'] for z in out):,.0f} post-secondary places")
    by_d = defaultdict(lambda: [0, 0.0, 0.0])
    for z in out:
        by_d[z["district"]][0] += 1
        by_d[z["district"]][1] += z["pop"]
        by_d[z["district"]][2] += sum(z["jobs"].values())
    for d, (n, p, j) in sorted(by_d.items()):
        print(f"    {d:9s} {n:5d} zones {p:10,.0f} residents {j:9,.0f} jobs")

    skim = car_skim(out)
    meta = {"version": 1, "year": 2011, "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "note": "Residents and jobs placed from 2010 buildings, scaled to 2011 controls (pipeline/curation/demand2011/"
                    "targets.json). Zones are H3 cells (res 8, sparse areas res 7).",
            "carSkim": {"file": "car-2011.bin", "format": "uint8 minutes, row-major origin x destination; 255 = no road path"},
            "zones": out}
    config.WEB_DATA.mkdir(parents=True, exist_ok=True)
    (config.WEB_DATA / "zones-2011.json").write_text(json.dumps(meta, separators=(",", ":")))
    (config.WEB_DATA / "car-2011.bin").write_bytes(skim.tobytes())
    print(f"  -> zones-2011.json ({(config.WEB_DATA / 'zones-2011.json').stat().st_size / 1e3:.0f} kB), "
          f"car-2011.bin ({skim.nbytes / 1e6:.1f} MB) in {time.time() - t0:.0f}s")
    return meta


def car_skim(zones: list[dict]) -> np.ndarray:
    """Zone-to-zone car times (minutes, uint8) on the 2010 road graph at AM-peak speeds."""
    t = pq.read_table(config.BUILD / "2010" / "roads.parquet", columns=["geometry", "class", "link"])
    lines, classes = [], []
    for g, c, link in zip(shapely.from_wkb(t["geometry"].to_numpy(zero_copy_only=False)), t["class"].to_pylist(),
                          t["link"].to_pylist()):
        for ln in _lines(g):
            lines.append(ln)
            classes.append("link" if link else c)
    graph = Graph(lines, classes)
    n = len(graph.node_lonlat)
    rows, cols, data = [], [], []
    for e in graph.edges:
        kmh = CAR_KMH.get(e.cls, 25)
        mid = e.coords[len(e.coords) // 2]
        if DOWNTOWN.contains(shapely.Point(*mid)):
            kmh *= DOWNTOWN_CAR_FACTOR
        w = e.length / (kmh / 3.6) / 60  # minutes
        rows += [e.u, e.v]
        cols += [e.v, e.u]
        data += [w, w]
    mat = coo_matrix((data, (rows, cols)), shape=(n, n)).tocsr()
    nodes = np.array([graph.nearest_node(z["lon"], z["lat"])[0] for z in zones])
    out = np.full((len(zones), len(zones)), 255, dtype=np.uint8)
    for s in range(0, len(zones), 64):
        d = dijkstra(mat, directed=False, indices=nodes[s:s + 64])[:, nodes]
        out[s:s + 64] = np.where(np.isfinite(d), np.clip(np.round(d), 1, 254), 255).astype(np.uint8)
    np.fill_diagonal(out, 2)
    print(f"  car skim: {len(zones)}² pairs on {n:,} road nodes; median {np.median(out[out < 255]):.0f} min")
    return out
