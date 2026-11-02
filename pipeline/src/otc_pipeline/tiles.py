"""Vector tiles (MVT in a single PMTiles file) for the 2010 base map.

Reads data/build/2010/*.parquet (from ``curate2010``) and writes
apps/web/public/data/basemap-2010.pmtiles following packages/shared/src/tile-schema.json.

Every feature gets a minimum zoom (by class, kind or size), is clipped to the tile plus a
small buffer, simplified in tile units and snapped to the 4096 grid. Tiles are built in
parallel worker processes.
"""

from __future__ import annotations

import gzip
import math
import multiprocessing as mp
import os
import time
from dataclasses import dataclass

import mapbox_vector_tile
import numpy as np
import pyarrow.parquet as pq
import shapely
from mapbox_vector_tile.encoder import on_invalid_geometry_make_valid
from pmtiles.tile import Compression, TileType
from shapely import STRtree

from . import config, pmt

EXTENT = 4096
BUFFER = 64  # tile units (= 8 px of a 512 px tile)
TILE_PX = 512
OUTPUT = "basemap-2010.pmtiles"


@dataclass
class Layer:
    name: str
    geom_kind: str  # point | line | polygon
    geoms: np.ndarray  # Web Mercator
    props: list[dict]
    minz: np.ndarray
    tree: STRtree


def _mpp(z: int) -> float:
    return pmt.WORLD / (TILE_PX * (1 << z))


def area_minzoom(area_m2: np.ndarray, px: float, floor: int) -> np.ndarray:
    """Smallest zoom at which a polygon of this (Mercator) area is at least ``px`` pixels across."""
    side = np.sqrt(np.maximum(area_m2, 1e-6))
    z = np.ceil(np.log2(px * pmt.WORLD / (TILE_PX * side)))
    return np.clip(z, floor, 14).astype(int)


def _props(t, fields: list[str]) -> list[dict]:
    cols = {f: t[f].to_pylist() for f in fields if f in t.column_names}
    out = []
    for i in range(t.num_rows):
        d = {}
        for f, col in cols.items():
            v = col[i]
            if v is None or (isinstance(v, float) and math.isnan(v)) or v == "":
                continue
            d[f] = v
        out.append(d)
    return out


def load_layers() -> list[Layer]:
    schema = config.tile_schema()["layers"]
    b = config.BUILD / "2010"
    layers: list[Layer] = []

    def read(name):
        t = pq.read_table(b / f"{name}.parquet")
        g = pmt.to_merc(shapely.from_wkb(t["geometry"].to_numpy(zero_copy_only=False)))
        return t, g

    w, s_, e, n = config.FETCH_BBOX
    clip_box = shapely.bounds(pmt.to_merc(shapely.box(w, s_, e, n)))
    for name, spec in schema.items():
        t, g = read(name)
        fields = list(spec["fields"].keys())
        kind = spec["geometry"]
        floor = spec["minzoom"]
        if name == "roads":
            cm = spec["classMinzoom"]
            cls = t["class"].to_pylist()
            link = t["link"].to_pylist()
            minz = np.array([max(cm.get(c, 14), 12 if l else 0) for c, l in zip(cls, link)])
        elif name == "waterway":
            cm = spec["classMinzoom"]
            minz = np.array([cm.get(k, 13) for k in t["kind"].to_pylist()])
        elif name == "places":
            km = spec["kindMinzoom"]
            minz = np.array([km.get(k, 14) for k in t["kind"].to_pylist()])
        elif name == "buildings":
            area = shapely.area(g) * 0.5  # mercator area is ~2x ground area at this latitude
            minz = np.where(area >= spec["minAreaByZoom"]["13"], 13, 14)
        elif name == "rail":
            minz = np.array([12 if c == "disused" else floor for c in t["class"].to_pylist()])
        elif name == "water_labels":
            km2 = np.array(t["area_km2"].to_pylist(), dtype=float)
            minz = np.where(km2 >= 1.0, 10, np.where(km2 >= 0.05, 12, 14))
        elif kind == "polygon" and name not in ("mask",):
            px = {"water": 1.5, "landcover": 3.0, "landuse": 2.5}.get(name, 2.0)
            minz = area_minzoom(shapely.area(g), px, floor)
        else:
            minz = np.full(len(g), floor)
        if name != "mask":  # Overture features overhang the fetch box; clip so nothing draws unfaded beyond it
            g = shapely.clip_by_rect(g, *clip_box)
        ok = ~shapely.is_empty(g)
        g, minz = g[ok], minz[ok]
        props = [p for p, k in zip(_props(t, fields), ok) if k]
        layers.append(Layer(name, kind, g, props, minz, STRtree(g)))
        print(f"  {name}: {len(g):,} features")
    return layers


_LAYERS: list[Layer] | None = None


def _simplify_tolerance(z: int, layer: str) -> float:
    if layer == "buildings":
        return 1.0 if z >= 14 else 4.0
    return 2.0 if z >= 14 else 4.0


def build_tile(zxy: tuple[int, int, int]) -> tuple[tuple[int, int, int], bytes | None]:
    z, x, y = zxy
    minx, miny, maxx, maxy = pmt.tile_bounds(z, x, y)
    size = maxx - minx
    pad = size * BUFFER / EXTENT
    query = shapely.box(minx - pad, miny - pad, maxx + pad, maxy + pad)
    out_layers = []
    for L in _LAYERS:
        idx = L.tree.query(query)
        if len(idx) == 0:
            continue
        idx = idx[L.minz[idx] <= z]
        if len(idx) == 0:
            continue
        g = L.geoms[idx]
        if L.geom_kind == "point":
            inside = (shapely.get_x(g) >= minx) & (shapely.get_x(g) < maxx) & (shapely.get_y(g) > miny) & (shapely.get_y(g) <= maxy)
            idx, g = idx[inside], g[inside]
        else:
            g = shapely.clip_by_rect(g, minx - pad, miny - pad, maxx + pad, maxy + pad)
        if len(g) == 0:
            continue
        # to tile coordinates (y down)
        g = shapely.transform(g, lambda c: np.column_stack([(c[:, 0] - minx) / size * EXTENT, (maxy - c[:, 1]) / size * EXTENT]))
        if L.geom_kind != "point":
            tol = _simplify_tolerance(z, L.name)
            g = shapely.simplify(g, tol, preserve_topology=(L.geom_kind == "polygon"))
            g = shapely.set_precision(g, 1.0)
        keep = ~shapely.is_empty(g)
        if L.geom_kind == "polygon":
            keep &= shapely.area(g) >= 2.0
        feats = [{"geometry": gg, "properties": L.props[i]} for gg, i, k in zip(g, idx, keep) if k]
        if feats:
            out_layers.append({"name": L.name, "features": feats})
    if not out_layers:
        return zxy, None
    data = mapbox_vector_tile.encode(out_layers, default_options={
        "extents": EXTENT, "y_coord_down": True, "on_invalid_geometry": on_invalid_geometry_make_valid})
    return zxy, gzip.compress(data, compresslevel=6)


def build_tiles(workers: int = 0) -> None:
    global _LAYERS
    config.ensure_dirs()
    schema = config.tile_schema()
    t0 = time.time()
    _LAYERS = load_layers()
    print(f"  loaded layers in {time.time() - t0:.0f}s")
    bbox = config.FETCH_BBOX
    jobs = [t for z in range(schema["minzoom"], schema["maxzoom"] + 1) for t in pmt.tiles_for_bbox(bbox, z)]
    workers = workers or os.cpu_count() or 2
    tiles: dict = {}
    t1 = time.time()
    with mp.get_context("fork").Pool(workers) as pool:
        for i, (zxy, data) in enumerate(pool.imap_unordered(build_tile, jobs, chunksize=4)):
            if data:
                tiles[zxy] = data
            if (i + 1) % 500 == 0:
                print(f"  {i + 1:,}/{len(jobs):,} tiles ({time.time() - t1:.0f}s)")
    region = config.region_config()
    home = region["home"]
    metadata = {
        "name": schema["name"],
        "description": schema["description"],
        "version": str(schema["version"]),
        "snapshot": config.SNAPSHOT_DATE,
        "attribution": "© OpenStreetMap contributors · Overture Maps Foundation",
        "vector_layers": [{"id": n, "fields": {k: "String" for k in s["fields"]}, "minzoom": s["minzoom"], "maxzoom": schema["maxzoom"]}
                          for n, s in schema["layers"].items()],
    }
    pmt.write_pmtiles(config.WEB_DATA / OUTPUT, tiles, tile_type=TileType.MVT, compression=Compression.GZIP,
                      bbox=bbox, center=(home["center"][0], home["center"][1], int(home["zoom"])), metadata=metadata)
    sizes = sorted(len(v) for v in tiles.values())
    print(f"  tiles: {len(tiles):,} non-empty of {len(jobs):,}; largest {sizes[-1] / 1e3:.0f} kB gz; built in {time.time() - t1:.0f}s")
    export_rail()


def export_rail() -> None:
    """The 2010 railway lines as a small JSON for the game (M8): commuter rail runs on them for the price
    of upgrading track, not building it."""
    import json
    t = pq.read_table(config.BUILD / "2010" / "rail.parquet")
    d = t.to_pydict()
    geoms = shapely.from_wkb(np.array(d["geometry"]))
    lines = []
    for g, cls, name in zip(geoms, d["class"], d["name"]):
        if g is None or shapely.is_empty(g):
            continue
        g = shapely.simplify(g, 0.00008)
        parts = list(g.geoms) if hasattr(g, "geoms") else [g]
        for part in parts:
            coords = [[round(x, 5), round(y, 5)] for x, y in shapely.get_coordinates(part)]
            if len(coords) >= 2:
                lines.append({"class": cls, "name": name or "", "line": coords})
    out = config.WEB_DATA / "rail-2010.json"
    out.write_text(json.dumps({"snapshot": config.SNAPSHOT_DATE, "source": "OpenStreetMap via Overture Maps, as of 1 December 2010", "lines": lines},
                              separators=(",", ":")))
    print(f"  rail: {len(lines)} lines -> {out.name} ({out.stat().st_size / 1e3:.0f} kB)")
