"""Paths and constants shared by every pipeline step."""

from __future__ import annotations

import json
import os
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
DATA = Path(os.environ.get("OTC_DATA_DIR", REPO / "data"))
RAW = DATA / "raw"
BUILD = DATA / "build"
REPORTS = DATA / "reports"
WEB_PUBLIC = REPO / "apps" / "web" / "public"
WEB_DATA = WEB_PUBLIC / "data"  # generated, gitignored
WEB_GLYPHS = WEB_PUBLIC / "glyphs"  # generated once, committed (small)
CURATION = REPO / "pipeline" / "curation"
SHARED = REPO / "packages" / "shared" / "src"

OVERTURE_RELEASE = os.environ.get("OTC_OVERTURE_RELEASE", "2026-10-21.0")
OVERTURE_BUCKET = "overturemaps-us-west-2/release/{release}/theme={theme}/type={type}/"

# The playable region is the union of the City of Ottawa and the Ville de Gatineau.
# We fetch a margin around it so the map has context (Gatineau Park, Chelsea, Rockland...).
FETCH_BBOX = (-76.42, 44.93, -75.18, 45.66)  # west, south, east, north

# The campaign starts on 1 December 2010; the base map is reconstructed for this date.
SNAPSHOT_DATE = "2010-12-01"


def region_config() -> dict:
    """The region definition shared with the web app (packages/shared/src/region.json)."""
    return json.loads((SHARED / "region.json").read_text())


def tile_schema() -> dict:
    """The vector-tile contract shared with the web app (packages/shared/src/tile-schema.json)."""
    return json.loads((SHARED / "tile-schema.json").read_text())


def ensure_dirs() -> None:
    for d in (RAW, BUILD, REPORTS, WEB_DATA, WEB_GLYPHS):
        d.mkdir(parents=True, exist_ok=True)
