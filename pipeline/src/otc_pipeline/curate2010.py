"""Reconstruct the base map as of the snapshot date (1 December 2010).

Inputs:  data/raw/overture/*.parquet   (today's city, from ``overture.py``)
Outputs: data/build/2010/*.parquet     (one table per tile layer, fields per tile-schema.json)
         data/reports/2010/report.json + diagnostic GeoJSON for review

Method (see pipeline/curation/README.md):
  1. Calibrate OSM-ID thresholds for the snapshot (``dating.py``).
  2. Find *post-2010 development zones*: clusters of newly-mapped local streets that are far
     from anything (streets, buildings, residential areas) mapped before the snapshot.
  3. Remove newly-mapped streets, buildings, small parks and ponds inside those zones and inside
     curated redevelopment areas; show the zones as undeveloped fields.
  4. Apply the curated name-based removals, renames and transforms.
"""

from __future__ import annotations

import json
import math
import time
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import shapely
from shapely import STRtree
from shapely.ops import polylabel

from . import config, dating

LON0, LAT0 = -75.7, 45.3
KX = 111_320 * math.cos(math.radians(LAT0))
KY = 110_950

ROAD_CLASS = {
    "motorway": "motorway", "trunk": "trunk", "primary": "primary", "secondary": "secondary",
    "tertiary": "tertiary", "residential": "minor", "unclassified": "minor", "living_street": "minor",
    "service": "service",
}
LOCAL_CLASSES = {"minor", "service"}
SKIP_SERVICE_SUBCLASSES = {"parking_aisle", "driveway", "drive_through"}

# Zone parameters (metres / m²) — tuned by looking at the diagnostic map, see report.json
ZONE_NEW_BUFFER = 70
ZONE_OLD_BUFFER = 110
ZONE_OLD_BUILDING_BUFFER = 45
ZONE_MIN_AREA = 50_000
ZONE_MIN_SOLIDITY = 0.35  # area / convex-hull area: subdivisions are compact, rural road corridors are not
ZONE_MIN_NEW_STREETS = 8
NEW_ARTERIAL_MIN_DIST = 180
NEW_ARTERIAL_ZONE_REACH = 400  # a new arterial is only removed if it serves a development zone


# ------------------------------------------------------------------------------------------ io

def _read(name: str):
    t = pq.read_table(config.RAW / "overture" / f"{name}.parquet")
    geoms = shapely.from_wkb(t["geometry"].to_numpy(zero_copy_only=False))
    cols = {c: t[c].to_numpy(zero_copy_only=False) for c in t.column_names if c != "geometry"}
    return geoms, cols


def to_m(g):
    return shapely.transform(g, lambda c: np.column_stack([(c[:, 0] - LON0) * KX, (c[:, 1] - LAT0) * KY]))


def to_ll(g):
    return shapely.transform(g, lambda c: np.column_stack([c[:, 0] / KX + LON0, c[:, 1] / KY + LAT0]))


def _write(name: str, geoms, fields: dict[str, list | np.ndarray], out_dir: Path) -> int:
    geoms = np.asarray(geoms, dtype=object)
    keep = ~shapely.is_empty(geoms) & ~shapely.is_missing(geoms)
    data = {"geometry": pa.array(shapely.to_wkb(geoms[keep]), type=pa.binary())}
    for k, v in fields.items():
        v = np.asarray(v, dtype=object)[keep]
        data[k] = pa.array([None if (x is None or (isinstance(x, float) and math.isnan(x))) else x for x in v])
    pq.write_table(pa.table(data), out_dir / f"{name}.parquet", compression="zstd")
    return int(keep.sum())


def _geojson(path: Path, geoms, props: list[dict] | None = None) -> None:
    feats = []
    for i, g in enumerate(geoms):
        if g is None or g.is_empty:
            continue
        feats.append({"type": "Feature", "properties": (props[i] if props else {}),
                      "geometry": json.loads(shapely.to_geojson(shapely.set_precision(g, 1e-6)))})
    path.write_text(json.dumps({"type": "FeatureCollection", "features": feats}))


# ------------------------------------------------------------------------------------- helpers

def split_bilingual(name, en, fr):
    """'Ottawa River / Rivière des Outaouais' -> en / fr parts when not given explicitly."""
    if name and " / " in name and (not en or not fr):
        a, b = name.split(" / ", 1)
        en, fr = en or a, fr or b
    return name, en, fr


def _names(cols, renames: dict[str, str]):
    out_n, out_en, out_fr = [], [], []
    for n, en, fr in zip(cols["name"], cols["name_en"], cols["name_fr"]):
        n, en, fr = split_bilingual(n, en, fr)
        if n in renames:
            n, en, fr = renames[n], None, None
        out_n.append(n)
        out_en.append(en)
        out_fr.append(fr)
    return out_n, out_en, out_fr


def _name_hits(cols_name_lists, rules: list[dict], layer: str) -> np.ndarray:
    """Boolean mask: feature name matches a curated removal for this layer."""
    names = list(zip(*cols_name_lists))
    hit = np.zeros(len(names), dtype=bool)
    for rule in rules:
        if rule.get("layer") not in (layer, "*"):
            continue
        m, prefix = rule["match"], rule.get("prefix", False)
        for i, ns in enumerate(names):
            if any(x and (x.startswith(m) if prefix else x == m) for x in ns):
                hit[i] = True
    return hit


def _in_zone(geoms_m, zone) -> np.ndarray:
    """Share of each geometry inside the zone (by length for lines, centroid test for others)."""
    n = len(geoms_m)
    parts = np.array([p for p in shapely.get_parts(zone) if not p.is_empty], dtype=object) if zone is not None else []
    if len(parts) == 0:
        return np.zeros(n)
    gi, pi = STRtree(parts).query(geoms_m, predicate="intersects")
    is_line = np.isin(shapely.get_type_id(geoms_m), [1, 5])
    out = np.zeros(n)
    sel = is_line[gi]
    if sel.any():
        inter = shapely.length(shapely.intersection(geoms_m[gi[sel]], parts[pi[sel]]))
        out += np.bincount(gi[sel], weights=inter, minlength=n) / np.maximum(shapely.length(geoms_m), 1e-9)
    if (~sel).any():
        inside = shapely.contains(parts[pi[~sel]], shapely.centroid(geoms_m[gi[~sel]]))
        hit = np.zeros(n, dtype=bool)
        hit[gi[~sel][inside]] = True
        out[hit] = 1.0
    return np.clip(out, 0, 1)


def _union_buffer(geoms_m, dist) -> shapely.Geometry:
    if len(geoms_m) == 0:
        return shapely.Polygon()
    return shapely.union_all(shapely.buffer(geoms_m, dist, quad_segs=2))


# --------------------------------------------------------------------------------------- steps

def curate() -> dict:
    t0 = time.time()
    config.ensure_dirs()
    out_dir = config.BUILD / "2010"
    rep_dir = config.REPORTS / "2010"
    out_dir.mkdir(parents=True, exist_ok=True)
    rep_dir.mkdir(parents=True, exist_ok=True)
    cur = json.loads((config.CURATION / "changes_after_2010.json").read_text())
    renames = {r["current"]: r["name_2010"] for r in cur["renames"]}
    report: dict = {"snapshot": config.SNAPSHOT_DATE, "overture_release": config.OVERTURE_RELEASE, "layers": {}}

    seg_g, seg = _read("segment")
    bld_g, bld = _read("building")
    wat_g, wat = _read("water")
    lu_g, lu = _read("land_use")
    land_g, land = _read("land")
    div_g, div = _read("division")
    area_g, area = _read("division_area")
    print(f"  loaded inputs in {time.time() - t0:.0f}s")

    # 1. thresholds --------------------------------------------------------------------------
    samples: dict[str, tuple[list, list]] = {}
    for cols in (seg, bld, wat, lu, land):
        for t, (ids, times) in dating.samples_from_columns(cols["osm_type"], cols["osm_id"], cols["osm_version"], cols["osm_time"]).items():
            a, b = samples.setdefault(t, ([], []))
            a.append(ids)
            b.append(times)
    snap = np.datetime64(config.SNAPSHOT_DATE)
    thresholds = {t: dating.calibrate(np.concatenate(a), np.concatenate(b), snap, t) for t, (a, b) in samples.items() if t in ("w", "r")}
    report["thresholds"] = {t: th.as_dict() for t, th in thresholds.items()}
    print("  thresholds:", {t: (th.threshold_id, th.samples, round(th.misclassified, 3)) for t, th in thresholds.items()})

    def old_of(cols):
        return dating.mapped_by_snapshot(cols["osm_type"], cols["osm_id"], thresholds)

    seg_old, bld_old, wat_old, lu_old = old_of(seg), old_of(bld), old_of(wat), old_of(lu)

    # 2. region -------------------------------------------------------------------------------
    is_city = np.isin(area["subtype"], ["county", "locality"])
    region = shapely.union_all(area_g[is_city])
    region_m = to_m(region)
    bbox = shapely.box(*config.FETCH_BBOX)
    mask = shapely.difference(shapely.buffer(bbox, 1.0, join_style="mitre"), region)  # extends past the tiles' edge
    prov = {r: g for g, r, st in zip(area_g, area["region"], area["subtype"]) if st == "region"}
    prov_line = shapely.intersection(shapely.boundary(prov["CA-ON"]), shapely.buffer(prov["CA-QC"], 1e-6)) if len(prov) == 2 else None
    prov_line = shapely.intersection(prov_line, bbox) if prov_line is not None else None
    city_lines = [shapely.intersection(shapely.boundary(g), bbox) for g in area_g[is_city]]
    n = _write("mask", [mask], {"kind": ["outside"]}, out_dir)
    nb = _write("boundary", city_lines + ([prov_line] if prov_line is not None else []),
                {"kind": ["city"] * len(city_lines) + (["province"] if prov_line is not None else [])}, out_dir)
    report["layers"]["mask"], report["layers"]["boundary"] = n, nb

    # 3. development zones ----------------------------------------------------------------------
    is_road = seg["subtype"] == "road"
    rclass = np.array([ROAD_CLASS.get(c) for c in seg["class"]], dtype=object)
    sub = seg["subclass"]
    seg_m = to_m(seg_g)
    local_new = is_road & np.isin(rclass, list(LOCAL_CLASSES)) & (seg_old == 0) & ~np.isin(sub, list(SKIP_SERVICE_SUBCLASSES))
    old_any_road = is_road & (seg_old == 1)
    resid_old = (lu["subtype"] == "residential") & (lu_old == 1)
    t1 = time.time()
    zone = shapely.difference(_union_buffer(seg_m[local_new], ZONE_NEW_BUFFER), _union_buffer(seg_m[old_any_road], ZONE_OLD_BUFFER))
    zone = shapely.difference(zone, _union_buffer(to_m(bld_g[bld_old == 1]), ZONE_OLD_BUILDING_BUFFER))
    zone = shapely.difference(zone, shapely.union_all(to_m(lu_g[resid_old])))
    cand = np.array([p for p in shapely.get_parts(zone) if p.area >= ZONE_MIN_AREA], dtype=object)
    new_mid = shapely.line_interpolate_point(seg_m[local_new], 0.5, normalized=True)
    pi, _ = STRtree(new_mid).query(cand, predicate="contains") if len(cand) else (np.array([], int), None)
    n_streets = np.bincount(pi, minlength=len(cand)) if len(cand) else np.array([])
    solidity = shapely.area(cand) / np.maximum(shapely.area(shapely.convex_hull(cand)), 1) if len(cand) else np.array([])
    parts = list(cand[(n_streets >= ZONE_MIN_NEW_STREETS) & (solidity >= ZONE_MIN_SOLIDITY)]) if len(cand) else []
    report_rejected = int(len(cand) - len(parts))
    zone = shapely.union_all(parts) if parts else shapely.Polygon()
    curated_areas = [shapely.Polygon(a["polygon"]) for a in cur["redevelopment_areas"]]
    curated_m = shapely.union_all(to_m(np.array(curated_areas, dtype=object))) if curated_areas else shapely.Polygon()
    clear = shapely.union_all([zone, curated_m])
    print(f"  zones: {len(parts)} areas, {zone.area / 1e6:.1f} km² in {time.time() - t1:.0f}s")
    report["zones"] = {"count": len(parts), "km2": round(zone.area / 1e6, 2), "rejected_sparse_or_linear": report_rejected,
                       "largest": sorted([{"ha": round(p.area / 1e4, 1),
                                           "at": [round(c, 4) for c in to_ll(p.centroid).coords[0]]} for p in parts],
                                         key=lambda d: -d["ha"])[:25]}
    _geojson(rep_dir / "zones.geojson", list(to_ll(np.array(parts, dtype=object))) if parts else [],
             [{"ha": round(p.area / 1e4, 1)} for p in parts])

    # 4. roads ----------------------------------------------------------------------------------
    names = _names(seg, renames)
    road_named_out = _name_hits(names, cur["remove_by_name"], "roads")
    frac = _in_zone(seg_m, clear)
    keep_road = is_road & (rclass != None) & ~np.isin(sub, list(SKIP_SERVICE_SUBCLASSES))  # noqa: E711
    new = seg_old != 1
    removed_zone = keep_road & new & (frac >= 0.5)
    # new arterials through greenfield, far from any 2010 road
    major_new = keep_road & new & ~removed_zone & np.isin(rclass, ["motorway", "trunk", "primary", "secondary", "tertiary"])
    far = np.zeros(len(seg_m), dtype=bool)
    if major_new.any() and not clear.is_empty:
        tree = STRtree(seg_m[old_any_road])
        mids = shapely.line_interpolate_point(seg_m[major_new], 0.5, normalized=True)
        _, dist = tree.query_nearest(mids, return_distance=True, all_matches=False)
        serves_zone = shapely.dwithin(mids, clear, NEW_ARTERIAL_ZONE_REACH)
        idx = np.flatnonzero(major_new)
        far[idx[(dist > NEW_ARTERIAL_MIN_DIST) & serves_zone]] = True
    out_mask = keep_road & ~road_named_out & ~removed_zone & ~far
    n = _write("roads", seg_g[out_mask], {
        "class": rclass[out_mask],
        "link": (sub == "link")[out_mask],
        "bridge": seg["bridge"][out_mask], "tunnel": seg["tunnel"][out_mask],
        "name": np.array(names[0], dtype=object)[out_mask], "name_en": np.array(names[1], dtype=object)[out_mask],
        "name_fr": np.array(names[2], dtype=object)[out_mask],
    }, out_dir)
    report["layers"]["roads"] = {"kept": n, "removed_zone": int(removed_zone.sum()), "removed_new_arterial": int(far.sum()),
                                 "removed_curated": int((keep_road & road_named_out).sum()),
                                 "old_share_by_length": round(float(shapely.length(seg_m[keep_road & (seg_old == 1)]).sum() /
                                                                   max(1, shapely.length(seg_m[keep_road]).sum())), 3)}
    _geojson(rep_dir / "removed_roads.geojson", list(seg_g[removed_zone | far | (keep_road & road_named_out)]))

    # 5. rail -----------------------------------------------------------------------------------
    is_rail = seg["subtype"] == "rail"
    kc = cur["keep_rail_corridor"]
    corridor = shapely.box(*kc["bbox"])
    in_corr = shapely.within(seg_g, corridor) & is_rail & (
        np.isin(seg["class"], kc["classes"]) & np.array([any((x or "").startswith(p) for p in kc["names"]) or x is None for x in seg["name"]]))
    rail_named_out = _name_hits(names, cur["remove_by_name"], "rail")
    rail_old = is_rail & (seg_old == 1) & np.isin(seg["class"], ["standard_gauge", "light_rail", "narrow_gauge"])
    rail_tree = STRtree(seg_m[rail_old]) if rail_old.any() else None
    rail_new_near = np.zeros(len(seg_g), dtype=bool)
    cand = is_rail & (seg_old != 1) & (seg["class"] == "standard_gauge")
    if rail_tree is not None and cand.any():
        _, d = rail_tree.query_nearest(shapely.line_interpolate_point(seg_m[cand], 0.5, normalized=True), return_distance=True, all_matches=False)
        rail_new_near[np.flatnonzero(cand)[d < 40]] = True
    rail_keep = in_corr | ((rail_old | rail_new_near) & ~rail_named_out)
    r_class = np.where(in_corr, "light_rail", np.where(seg["class"] == "light_rail", "light_rail", "rail")).astype(object)
    r_name = np.where(in_corr, kc["name_2010"], np.array(names[0], dtype=object)).astype(object)
    # transforms: e.g. today's multi-use path on the old Prince of Wales rail bridge
    tr_geoms, tr_class, tr_name = [], [], []
    for tr in cur["transforms"]:
        hit = np.array([n0 == tr["match"] for n0 in seg["name"]])
        if hit.any():
            tr_geoms.append(shapely.line_merge(shapely.union_all(seg_g[hit])))
            tr_class.append(tr["class"])
            tr_name.append(tr["name_2010"])
    n = _write("rail", list(seg_g[rail_keep]) + tr_geoms,
               {"class": list(r_class[rail_keep]) + tr_class, "name": list(r_name[rail_keep]) + tr_name}, out_dir)
    report["layers"]["rail"] = {"kept": n, "o_train_corridor_segments": int(in_corr.sum()), "transforms": len(tr_geoms)}

    # 6. buildings ------------------------------------------------------------------------------
    bld_m_cent = to_m(shapely.centroid(bld_g))
    shapely.prepare(clear)
    in_clear = shapely.contains(clear, bld_m_cent) if not clear.is_empty else np.zeros(len(bld_g), dtype=bool)
    area_m2 = shapely.area(to_m(bld_g))
    bkeep = ((bld_old == 1) | ~in_clear) & (area_m2 >= 15)
    h = bld["height"].astype("float64")
    floors = bld["num_floors"].astype("float64")
    h = np.where(np.isnan(h), floors * 3.2, h)
    h = np.where(np.isnan(h), np.where(area_m2 > 400, 9.0, 6.5), h)
    h = np.clip(h, 2.5, 160.0).round(1)
    n = _write("buildings", bld_g[bkeep], {"h": h[bkeep]}, out_dir)
    report["layers"]["buildings"] = {"kept": n, "removed": int((~bkeep & (area_m2 >= 15)).sum())}

    # 7. water ------------------------------------------------------------------------------------
    w_poly = np.isin(shapely.get_type_id(wat_g), [3, 6])
    w_line = np.isin(shapely.get_type_id(wat_g), [1, 5])
    w_names = _names(wat, renames)
    w_in_clear = _in_zone(to_m(wat_g), clear) >= 0.5
    w_kind = np.array([{"river": "river", "lake": "lake", "canal": "canal", "pond": "pond", "reservoir": "reservoir"}.get(s, "water")
                       for s in wat["subtype"]], dtype=object)
    w_keep = w_poly & (wat["subtype"] != "human_made") & ~((wat_old != 1) & w_in_clear)
    n = _write("water", wat_g[w_keep], {"kind": w_kind[w_keep], "name": np.array(w_names[0], dtype=object)[w_keep],
                                         "name_en": np.array(w_names[1], dtype=object)[w_keep],
                                         "name_fr": np.array(w_names[2], dtype=object)[w_keep]}, out_dir)
    ww_kind = np.array([{"river": "river", "stream": "stream", "canal": "canal", "drain": "drain", "ditch": "drain"}.get(s) for s in wat["subtype"]], dtype=object)
    ww_keep = w_line & (ww_kind != None) & ~((wat_old != 1) & w_in_clear)  # noqa: E711
    n2 = _write("waterway", wat_g[ww_keep], {"kind": ww_kind[ww_keep], "name": np.array(w_names[0], dtype=object)[ww_keep],
                                             "name_en": np.array(w_names[1], dtype=object)[ww_keep],
                                             "name_fr": np.array(w_names[2], dtype=object)[ww_keep]}, out_dir)
    # labels for named water bodies (rivers are labelled along their waterway lines instead)
    lab = w_keep & np.array([bool(x) for x in w_names[0]]) & (w_kind != "river")
    lab_g = [_label_point(g) for g in wat_g[lab]]
    km2 = shapely.area(to_m(wat_g[lab])) / 1e6
    n3 = _write("water_labels", lab_g, {"kind": w_kind[lab], "name": np.array(w_names[0], dtype=object)[lab],
                                        "name_en": np.array(w_names[1], dtype=object)[lab],
                                        "name_fr": np.array(w_names[2], dtype=object)[lab], "area_km2": np.round(km2, 3)}, out_dir)
    report["layers"]["water"], report["layers"]["waterway"], report["layers"]["water_labels"] = n, n2, n3

    # 8. landcover + landuse ----------------------------------------------------------------------
    lc = _write("landcover", list(land_g) + list(to_ll(np.array(parts, dtype=object))),
                {"kind": list(land["subtype"]) + ["field"] * len(parts)}, out_dir)
    lu_kind = np.array([_landuse_kind(s, c) for s, c in zip(lu["subtype"], lu["class"])], dtype=object)
    lu_in_clear = _in_zone(to_m(lu_g), clear) >= 0.5
    lu_keep = (lu_kind != None) & np.isin(shapely.get_type_id(lu_g), [3, 6]) & ~((lu_old != 1) & lu_in_clear)  # noqa: E711
    lu_out = lu_g.copy()
    # built-up areas: cut out post-2010 development (a polygon mapped before 2010 may have been extended since)
    urban = lu_keep & np.isin(lu_kind, ["residential", "commercial"])
    if urban.any() and not clear.is_empty:
        lu_out[urban] = to_ll(shapely.difference(to_m(lu_g[urban]), clear))
    lun = _write("landuse", lu_out[lu_keep], {"kind": lu_kind[lu_keep], "name": lu["name"][lu_keep]}, out_dir)
    report["layers"]["landcover"], report["layers"]["landuse"] = lc, lun

    # 9. places -----------------------------------------------------------------------------------
    pk, prank = [], []
    for st, cl, pop in zip(div["subtype"], div["class"], div["population"]):
        kind = {"city": "city", "town": "town", "village": "village", "hamlet": "hamlet"}.get(cl or "", None) if st == "locality" else \
            {"macrohood": "district", "neighborhood": "neighbourhood", "microhood": "micro"}.get(st)
        if st == "locality" and kind is None:
            kind = "village"
        pk.append(kind)
        prank.append(pop)
    pk = np.array(pk, dtype=object)
    pop = np.array([p if p is not None else -1 for p in prank], dtype=float)
    p_names = _names(div, renames)
    p_out = _name_hits(p_names, cur["remove_by_name"], "places")
    p_in_clear = shapely.contains(clear, to_m(div_g)) if not clear.is_empty else np.zeros(len(div_g), dtype=bool)
    pkeep = (pk != None) & ~p_out & ~(p_in_clear & np.isin(pk, ["neighbourhood", "micro"]))  # noqa: E711
    order_rank = np.zeros(len(pk), dtype=int)
    for kind in set(pk[pkeep]):
        idx = np.flatnonzero(pkeep & (pk == kind))
        order = idx[np.argsort(-pop[idx], kind="stable")]
        order_rank[order] = np.arange(1, len(order) + 1)
    n = _write("places", div_g[pkeep], {"kind": pk[pkeep], "rank": order_rank[pkeep],
                                         "name": np.array(p_names[0], dtype=object)[pkeep],
                                         "name_en": np.array(p_names[1], dtype=object)[pkeep],
                                         "name_fr": np.array(p_names[2], dtype=object)[pkeep]}, out_dir)
    report["layers"]["places"] = {"kept": n, "removed_curated": int(p_out.sum()), "removed_in_new_zones": int((p_in_clear & np.isin(pk, ["neighbourhood", "micro"])).sum())}

    report["curation"] = {"remove_by_name": len(cur["remove_by_name"]), "redevelopment_areas": len(cur["redevelopment_areas"]),
                          "renames": len(cur["renames"]), "transforms": len(cur["transforms"])}
    report["seconds"] = round(time.time() - t0)
    (rep_dir / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(json.dumps(report["layers"], indent=1))
    return report


def _label_point(g):
    try:
        return polylabel(g, tolerance=1e-5) if g.geom_type == "Polygon" else polylabel(max(shapely.get_parts(g), key=lambda p: p.area), tolerance=1e-5)
    except Exception:  # pragma: no cover - degenerate geometry
        return g.representative_point()


def _landuse_kind(subtype, cls):
    cls = cls or ""
    if cls in ("park", "garden", "village_green", "dog_park", "recreation_ground", "common"):
        return "park"
    if cls in ("nature_reserve", "national_park") or subtype == "protected":
        return "nature"
    if subtype == "residential":
        return "residential"
    if subtype == "developed" and cls in ("commercial", "industrial", "retail"):
        return "commercial"
    if subtype == "agriculture" and cls in ("farmland", "meadow"):
        return "farmland"
    if cls == "golf_course":
        return "golf"
    if cls in ("cemetery", "grave_yard"):
        return "cemetery"
    if cls in ("pitch", "stadium", "track", "sports_centre"):
        return "sports"
    if subtype == "education" and cls in ("university", "college", "school"):
        return "campus"
    if subtype == "medical" and cls in ("hospital",):
        return "hospital"
    return None
