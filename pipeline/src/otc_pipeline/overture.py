"""Fetch a bbox of Overture Maps data (anonymous S3) into compact GeoParquet-like files.

Each output table has a WKB ``geometry`` column plus the attributes the later steps need.
For features derived from OpenStreetMap we keep the provenance of the *oldest* OSM element
(``osm_type``, ``osm_id``, ``osm_version``, ``osm_time``). OSM IDs are issued in time order,
so ``dating.py`` can tell whether a feature had already been mapped by December 2010.
"""

from __future__ import annotations

import os
import re
import time
from pathlib import Path
from typing import Callable, Iterable

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.dataset as ds
import pyarrow.fs as pafs
import pyarrow.parquet as pq

from . import config

_RECORD = re.compile(r"^([nwr])(\d+)@(\d+)$")


def _fs() -> pafs.S3FileSystem:
    return pafs.S3FileSystem(anonymous=True, region="us-west-2", proxy_options=os.environ.get("HTTPS_PROXY"))


def _dataset(theme: str, typ: str) -> ds.Dataset:
    path = config.OVERTURE_BUCKET.format(release=config.OVERTURE_RELEASE, theme=theme, type=typ)
    return ds.dataset(path, filesystem=_fs(), format="parquet")


def _bbox_filter(bbox):
    w, s, e, n = bbox
    return (
        (pc.field("bbox", "xmin") <= e) & (pc.field("bbox", "xmax") >= w)
        & (pc.field("bbox", "ymin") <= n) & (pc.field("bbox", "ymax") >= s)
    )


def names_of(names: dict | None) -> tuple[str | None, str | None, str | None]:
    """(primary, en, fr) from an Overture ``names`` struct."""
    if not names:
        return None, None, None
    common = names.get("common") or {}
    if isinstance(common, list):  # pyarrow map -> list of (k, v)
        common = dict(common)
    return names.get("primary"), common.get("en"), common.get("fr")


def osm_provenance(sources: list[dict] | None) -> tuple[str | None, int | None, int | None, str | None]:
    """The oldest OSM element behind a feature: (type, id, version, update_time)."""
    best = None
    for src in sources or []:
        m = _RECORD.match(src.get("record_id") or "")
        if not m:
            continue
        typ, oid, ver = m.group(1), int(m.group(2)), int(m.group(3))
        if best is None or (typ, oid) < (best[0], best[1]):
            best = (typ, oid, ver, src.get("update_time"))
    return best if best else (None, None, None, None)


def _flags(flag_list, wanted: str) -> bool:
    for f in flag_list or []:
        if wanted in (f.get("values") or []):
            return True
    return False


Row = dict
Transform = Callable[[Row], Row | None]

_S, _I, _F, _B = pa.string(), pa.int64(), pa.float64(), pa.bool_()
_COMMON = [("geometry", pa.binary()), ("name", _S), ("name_en", _S), ("name_fr", _S),
           ("osm_type", _S), ("osm_id", _I), ("osm_version", _I), ("osm_time", _S)]
SCHEMAS = {
    "segment": pa.schema(_COMMON + [("subtype", _S), ("class", _S), ("subclass", _S), ("bridge", _B), ("tunnel", _B)]),
    "water": pa.schema(_COMMON + [("subtype", _S), ("class", _S)]),
    "land": pa.schema(_COMMON + [("subtype", _S), ("class", _S)]),
    "land_use": pa.schema(_COMMON + [("subtype", _S), ("class", _S)]),
    "building": pa.schema([("geometry", pa.binary()), ("height", _F), ("num_floors", _I), ("class", _S),
                           ("osm_type", _S), ("osm_id", _I), ("osm_version", _I), ("osm_time", _S)]),
    "division": pa.schema([("geometry", pa.binary()), ("name", _S), ("name_en", _S), ("name_fr", _S),
                           ("subtype", _S), ("class", _S), ("population", _I), ("region", _S), ("local_type", _S)]),
    "division_area": pa.schema([("geometry", pa.binary()), ("name", _S), ("subtype", _S), ("region", _S)]),
    "transit_place": pa.schema([("geometry", pa.binary()), ("name", _S), ("name_en", _S), ("name_fr", _S),
                                ("category", _S), ("confidence", _F)]),
}


def fetch_layer(name: str, theme: str, typ: str, columns: list[str], transform: Transform,
                bbox=config.FETCH_BBOX, out_dir: Path | None = None) -> Path:
    out_dir = out_dir or (config.RAW / "overture")
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{name}.parquet"
    t0 = time.time()
    dset = _dataset(theme, typ)
    cols = [c for c in columns if c in dset.schema.names]
    writer = None
    n_in = n_out = 0
    for batch in dset.to_batches(columns=cols, filter=_bbox_filter(bbox), batch_size=20_000):
        rows = batch.to_pylist()
        n_in += len(rows)
        outs = [r for r in (transform(row) for row in rows) if r is not None]
        if not outs:
            continue
        table = pa.Table.from_pylist(outs, schema=SCHEMAS[name])
        if writer is None:
            writer = pq.ParquetWriter(out, table.schema, compression="zstd")
        writer.write_table(table)
        n_out += len(outs)
    if writer is not None:
        writer.close()
    print(f"  {name}: {n_out:,} of {n_in:,} features in {time.time() - t0:.0f}s -> {out.relative_to(config.REPO)}")
    return out


# ---------------------------------------------------------------------------------------------
# per-layer transforms


def _common(r: Row) -> Row:
    name, en, fr = names_of(r.get("names"))
    typ, oid, ver, t = osm_provenance(r.get("sources"))
    return {"geometry": r["geometry"], "name": name, "name_en": en, "name_fr": fr,
            "osm_type": typ, "osm_id": oid, "osm_version": ver, "osm_time": t}


def t_segment(r: Row) -> Row | None:
    if r.get("subtype") not in ("road", "rail"):
        return None
    out = _common(r)
    out.update({
        "subtype": r.get("subtype"),
        "class": r.get("class"),
        "subclass": r.get("subclass"),
        "bridge": _flags(r.get("road_flags"), "is_bridge") or _flags(r.get("rail_flags"), "is_bridge"),
        "tunnel": _flags(r.get("road_flags"), "is_tunnel") or _flags(r.get("rail_flags"), "is_tunnel"),
    })
    return out


def t_water(r: Row) -> Row | None:
    out = _common(r)
    out.update({"subtype": r.get("subtype"), "class": r.get("class")})
    return out


def t_land(r: Row) -> Row | None:
    if r.get("subtype") not in ("forest", "wetland", "grass", "shrub"):
        return None
    out = _common(r)
    out.update({"subtype": r.get("subtype"), "class": r.get("class")})
    return out


def t_land_use(r: Row) -> Row | None:
    out = _common(r)
    out.update({"subtype": r.get("subtype"), "class": r.get("class")})
    return out


def t_building(r: Row) -> Row | None:
    typ, oid, ver, t = osm_provenance(r.get("sources"))
    return {"geometry": r["geometry"], "height": r.get("height"), "num_floors": r.get("num_floors"),
            "class": r.get("class"), "osm_type": typ, "osm_id": oid, "osm_version": ver, "osm_time": t}


def t_division(r: Row) -> Row | None:
    if r.get("subtype") not in ("locality", "localadmin", "county", "macrohood", "neighborhood", "microhood"):
        return None
    name, en, fr = names_of(r.get("names"))
    return {"geometry": r["geometry"], "name": name, "name_en": en, "name_fr": fr,
            "subtype": r.get("subtype"), "class": r.get("class"), "population": r.get("population"),
            "region": r.get("region"), "local_type": str(r.get("local_type")) if r.get("local_type") else None}


def t_division_area(r: Row) -> Row | None:
    name, en, fr = names_of(r.get("names"))
    if r.get("class") != "land":
        return None
    keep = (r.get("subtype") == "region" and r.get("region") in ("CA-ON", "CA-QC")) or \
           (r.get("subtype") in ("county", "locality") and name in ("Ottawa", "Gatineau"))
    if not keep:
        return None
    return {"geometry": r["geometry"], "name": name, "subtype": r.get("subtype"), "region": r.get("region")}


TRANSIT_CATEGORIES = {"bus_station", "train_station", "light_rail_and_subway_stations", "metro_station",
                      "public_transit_facility_or_service", "transportation"}


def t_transit_place(r: Row) -> Row | None:
    cat = (r.get("taxonomy") or {}).get("primary")
    if cat not in TRANSIT_CATEGORIES:
        return None
    name, en, fr = names_of(r.get("names"))
    return {"geometry": r["geometry"], "name": name, "name_en": en, "name_fr": fr,
            "category": cat, "confidence": r.get("confidence")}


LAYERS: dict[str, tuple[str, str, list[str], Transform]] = {
    "division_area": ("divisions", "division_area", ["geometry", "names", "subtype", "class", "region"], t_division_area),
    "division": ("divisions", "division", ["geometry", "names", "subtype", "class", "population", "region", "local_type"], t_division),
    "water": ("base", "water", ["geometry", "names", "subtype", "class", "sources"], t_water),
    "land": ("base", "land", ["geometry", "subtype", "class", "sources"], t_land),
    "land_use": ("base", "land_use", ["geometry", "names", "subtype", "class", "sources"], t_land_use),
    "segment": ("transportation", "segment",
                ["geometry", "names", "subtype", "class", "subclass", "road_flags", "rail_flags", "sources"], t_segment),
    "building": ("buildings", "building", ["geometry", "height", "num_floors", "class", "sources"], t_building),
    "transit_place": ("places", "place", ["geometry", "names", "taxonomy", "confidence"], t_transit_place),
}


def fetch(layers: Iterable[str] | None = None) -> None:
    config.ensure_dirs()
    print(f"Overture {config.OVERTURE_RELEASE}, bbox {config.FETCH_BBOX}")
    for name in layers or LAYERS:
        theme, typ, cols, fn = LAYERS[name]
        fetch_layer(name, theme, typ, cols, fn)
