"""Terrain: NRCan Canadian Digital Elevation Model -> Terrarium-encoded raster tiles.

1. Read a window of the national CDEM (bare-earth DEM, 16 m, Open Government Licence – Canada)
   straight from NRCan's public cloud-optimised GeoTIFF -> data/raw/dem/cdem-ottawa.tif
2. Warp to Web Mercator per tile and encode elevations as Terrarium PNGs
   -> apps/web/public/data/terrain.pmtiles (MapLibre ``raster-dem`` source, hillshading)
"""

from __future__ import annotations

import io
import os
import time

import numpy as np
import rasterio
from PIL import Image
from pmtiles.tile import Compression, TileType
from rasterio.enums import Resampling
from rasterio.vrt import WarpedVRT
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds

from . import config, pmt

CDEM_URL = "https://datacube-prod-data-public.s3.ca-central-1.amazonaws.com/store/elevation/cdem-cdsm/cdem/cdem-canada-dem.tif"
MINZOOM, MAXZOOM, TILE = 7, 12, 256
OUTPUT = "terrain.pmtiles"


def _gdal_env():
    env = {"GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR", "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif",
           "GDAL_HTTP_MULTIRANGE": "YES", "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES"}
    ca = os.environ.get("CURL_CA_BUNDLE") or os.environ.get("SSL_CERT_FILE") or ("/root/.ccr/ca-bundle.crt" if os.path.exists("/root/.ccr/ca-bundle.crt") else None)
    if ca:
        env["GDAL_CURL_CA_BUNDLE"] = ca
    if os.environ.get("HTTPS_PROXY"):
        env["GDAL_HTTP_PROXY"] = os.environ["HTTPS_PROXY"]
    return env


def download_dem() -> str:
    out = config.RAW / "dem" / "cdem-ottawa.tif"
    if out.exists():
        return str(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    with rasterio.Env(**_gdal_env()), rasterio.open(f"/vsicurl/{CDEM_URL}") as src:
        b = transform_bounds("EPSG:4326", src.crs, *config.FETCH_BBOX, densify_pts=21)
        win = from_bounds(*b, transform=src.transform).round_offsets().round_lengths()
        data = src.read(1, window=win)
        profile = src.profile | {"width": data.shape[1], "height": data.shape[0],
                                 "transform": src.window_transform(win), "driver": "GTiff",
                                 "compress": "deflate", "tiled": True, "blockxsize": 512, "blockysize": 512}
        with rasterio.open(out, "w", **profile) as dst:
            dst.write(data, 1)
    print(f"  downloaded CDEM window {data.shape[1]}x{data.shape[0]} in {time.time() - t0:.0f}s -> {out.relative_to(config.REPO)}")
    return str(out)


def terrarium(elev: np.ndarray) -> bytes:
    v = np.clip(elev, -1000, 8000).astype(np.float64) + 32768.0
    r = np.floor(v / 256)
    g = np.floor(v) % 256
    b = np.floor((v - np.floor(v)) * 256)
    rgb = np.dstack([r, g, b]).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(rgb, "RGB").save(buf, "PNG", optimize=True)
    return buf.getvalue()


def build_terrain() -> None:
    config.ensure_dirs()
    path = download_dem()
    tiles: dict = {}
    t0 = time.time()
    with rasterio.open(path) as src:
        nodata = src.nodata
        for z in range(MINZOOM, MAXZOOM + 1):
            for (zz, x, y) in pmt.tiles_for_bbox(config.FETCH_BBOX, z):
                minx, miny, maxx, maxy = pmt.tile_bounds(zz, x, y)
                transform = rasterio.transform.from_bounds(minx, miny, maxx, maxy, TILE, TILE)
                with WarpedVRT(src, crs="EPSG:3857", transform=transform, width=TILE, height=TILE,
                               resampling=Resampling.bilinear if z >= 11 else Resampling.average,
                               src_nodata=nodata, nodata=nodata) as vrt:
                    a = vrt.read(1).astype(np.float32)
                valid = a != nodata
                if not valid.any():
                    continue
                a[~valid] = float(np.median(a[valid]))  # flat fill outside the DEM window
                tiles[(zz, x, y)] = terrarium(a)
    home = config.region_config()["home"]
    pmt.write_pmtiles(config.WEB_DATA / OUTPUT, tiles, tile_type=TileType.PNG, compression=Compression.NONE,
                      bbox=config.FETCH_BBOX, center=(home["center"][0], home["center"][1], int(home["zoom"])),
                      metadata={"name": "otc-terrain", "encoding": "terrarium",
                                "attribution": "Canadian Digital Elevation Model © Natural Resources Canada (Open Government Licence – Canada)"})
    print(f"  terrain tiles z{MINZOOM}-{MAXZOOM} in {time.time() - t0:.0f}s")
