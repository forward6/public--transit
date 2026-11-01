"""Web-Mercator tile maths and a small PMTiles writer wrapper."""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import shapely
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer

R = 6378137.0
WORLD = 2 * math.pi * R


def to_merc(g):
    """lon/lat (EPSG:4326) -> Web Mercator metres (EPSG:3857)."""
    def f(c):
        lat = np.clip(c[:, 1], -85.05112878, 85.05112878)
        return np.column_stack([np.radians(c[:, 0]) * R, R * np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))])
    return shapely.transform(g, f)


def tile_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    size = WORLD / (1 << z)
    minx = -WORLD / 2 + x * size
    maxy = WORLD / 2 - y * size
    return minx, maxy - size, minx + size, maxy


def lonlat_to_tile(lon: float, lat: float, z: int) -> tuple[int, int]:
    n = 1 << z
    x = int((lon + 180) / 360 * n)
    lat_r = math.radians(lat)
    y = int((1 - math.log(math.tan(lat_r) + 1 / math.cos(lat_r)) / math.pi) / 2 * n)
    return min(max(x, 0), n - 1), min(max(y, 0), n - 1)


def tiles_for_bbox(bbox, z: int) -> list[tuple[int, int, int]]:
    w, s, e, n = bbox
    x0, y0 = lonlat_to_tile(w, n, z)
    x1, y1 = lonlat_to_tile(e, s, z)
    return [(z, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]


def write_pmtiles(path: Path, tiles: dict[tuple[int, int, int], bytes], *, tile_type: TileType, compression: Compression,
                  bbox, center: tuple[float, float, int], metadata: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    entries = sorted((zxy_to_tileid(*k), v) for k, v in tiles.items())
    with open(path, "wb") as f:
        w = Writer(f)
        for tid, data in entries:
            w.write_tile(tid, data)
        zooms = [k[0] for k in tiles]
        w.finalize({
            "tile_type": tile_type,
            "tile_compression": compression,
            "min_zoom": min(zooms), "max_zoom": max(zooms),
            "min_lon_e7": int(bbox[0] * 1e7), "min_lat_e7": int(bbox[1] * 1e7),
            "max_lon_e7": int(bbox[2] * 1e7), "max_lat_e7": int(bbox[3] * 1e7),
            "center_zoom": int(center[2]), "center_lon_e7": int(center[0] * 1e7), "center_lat_e7": int(center[1] * 1e7),
        }, metadata)
    print(f"  wrote {path.name}: {len(tiles):,} tiles, {path.stat().st_size / 1e6:.1f} MB")


def dumps(obj) -> str:
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
