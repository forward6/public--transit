"""Quick-look PNG of the 2010 reconstruction for review (no GIS software needed).

    uv run python -m otc_pipeline.diagnostics [WEST SOUTH EAST NORTH] [--out FILE]

Grey: streets kept for 2010 · red: streets removed as post-2010 · pink: post-2010 zones ·
blue: water. Written to data/reports/2010/diagnostic.png by default.
"""

from __future__ import annotations

import argparse
import json
import math

import numpy as np
import pyarrow.parquet as pq
import shapely
from PIL import Image, ImageDraw, ImageFont

from . import config


def _load(path):
    t = pq.read_table(path)
    return shapely.from_wkb(t["geometry"].to_numpy(zero_copy_only=False)), t


def render(bbox=config.FETCH_BBOX, out=None, width=2400):
    w, s, e, n = bbox
    kx = math.cos(math.radians((s + n) / 2))
    height = int(width * (n - s) / ((e - w) * kx))
    img = Image.new("RGB", (width, height), (246, 244, 239))
    d = ImageDraw.Draw(img, "RGBA")

    def px(coords):
        return [((x - w) / (e - w) * width, (n - y) / (n - s) * height) for x, y in coords]

    def draw(geom, fill=None, outline=None, line=None, lw=1):
        for part in shapely.get_parts(geom):
            if part.geom_type == "Polygon":
                d.polygon(px(part.exterior.coords), fill=fill, outline=outline)
            elif part.geom_type == "LineString":
                d.line(px(part.coords), fill=line, width=lw)

    clip = shapely.box(*bbox)
    b = config.BUILD / "2010"
    rep = config.REPORTS / "2010"
    water, _ = _load(b / "water.parquet")
    for g in water[shapely.intersects(water, clip)]:
        draw(g, fill=(170, 200, 222, 255))
    zones = json.loads((rep / "zones.geojson").read_text())["features"]
    for f in zones:
        draw(shapely.from_geojson(json.dumps(f["geometry"])), fill=(236, 120, 150, 110))
    roads, rt = _load(b / "roads.parquet")
    cls = rt["class"].to_numpy(zero_copy_only=False)
    sel = shapely.intersects(roads, clip)
    for g, c in zip(roads[sel], cls[sel]):
        draw(g, line=(90, 98, 112, 255) if c in ("motorway", "trunk", "primary", "secondary") else (140, 146, 156, 255),
             lw=2 if c in ("motorway", "trunk", "primary") else 1)
    removed = json.loads((rep / "removed_roads.geojson").read_text())["features"]
    for f in removed:
        g = shapely.from_geojson(json.dumps(f["geometry"]))
        if g.intersects(clip):
            draw(g, line=(214, 38, 61, 255), lw=1)
    boundary, _ = _load(b / "boundary.parquet")
    for g in boundary:
        draw(g, line=(20, 33, 58, 200), lw=2)
    font = ImageFont.load_default(size=22)
    d.rectangle([0, 0, width, 40], fill=(255, 255, 255, 220))
    d.text((12, 8), "2010 reconstruction · grey = kept streets · red = removed (post-2010) · pink = post-2010 development zones",
           fill=(20, 33, 58), font=font)
    out = out or (rep / "diagnostic.png")
    img.save(out)
    print("wrote", out)
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("bbox", nargs="*", type=float)
    p.add_argument("--out")
    p.add_argument("--width", type=int, default=2400)
    a = p.parse_args()
    render(tuple(a.bbox) if len(a.bbox) == 4 else config.FETCH_BBOX, a.out, a.width)


if __name__ == "__main__":
    main()
