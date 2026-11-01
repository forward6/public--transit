"""``otc-pipeline`` command line: run one step or ``all``.

Steps (in order):
  fetch     download Overture Maps data for the region            -> data/raw/overture/*.parquet
  curate    reconstruct the city as of 1 December 2010            -> data/build/2010/*.parquet + data/reports/
  terrain   NRCan CDEM elevation -> Terrarium-encoded raster tiles -> apps/web/public/data/terrain.pmtiles
  tiles     vector tiles for the base map                         -> apps/web/public/data/basemap-2010.pmtiles
  glyphs    SDF label glyphs (Inter, Source Serif 4)              -> apps/web/public/glyphs/
  wiki      2010 route catalogue + Transitway stations (Wikipedia
            revisions as of 1 Dec 2010)                           -> data/build/2010/route_catalogue.json
  network   the 2010 transit network (archived GTFS from the
            data/gtfs-2010 branch; --gtfs FILE.zip, --no-gtfs)    -> apps/web/public/data/network-2010.json
  zones     2011 demand zones: residents, jobs, segments, car times -> apps/web/public/data/zones-2011.json
  archive   search the Wayback Machine for 2010 GTFS feeds        -> data/raw/archive/ (not part of `all`)
"""

from __future__ import annotations

import argparse
import time

STEPS = ["fetch", "curate", "terrain", "tiles", "glyphs", "wiki", "network", "zones"]


def run(step: str, args: argparse.Namespace) -> None:
    t0 = time.time()
    print(f"== {step}")
    if step == "fetch":
        from .overture import fetch
        fetch(args.layers.split(",") if args.layers else None)
    elif step == "curate":
        from .curate2010 import curate
        curate()
    elif step == "terrain":
        from .terrain import build_terrain
        build_terrain()
    elif step == "tiles":
        from .tiles import build_tiles
        build_tiles(workers=args.workers)
    elif step == "glyphs":
        from .glyphs import build_glyphs
        build_glyphs()
    elif step == "wiki":
        from .wiki import build_wiki
        build_wiki()
    elif step == "network":
        from .network2010 import build_network
        build_network(gtfs=args.gtfs, gtfs_date=args.gtfs_date, use_default_feeds=not args.no_gtfs)
    elif step == "zones":
        from .zones import build_zones
        build_zones()
    elif step == "archive":
        from .archive import search_and_download
        search_and_download()
    print(f"== {step} done in {time.time() - t0:.0f}s")


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="otc-pipeline", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("step", choices=STEPS + ["archive", "all"])
    p.add_argument("--layers", help="fetch: comma-separated subset of layers")
    p.add_argument("--workers", type=int, default=0, help="tiles: worker processes (default: CPU count)")
    p.add_argument("--gtfs", action="append", help="network: import a (2010) GTFS zip for the service (repeatable)")
    p.add_argument("--no-gtfs", action="store_true", help="network: don't import the default archived feeds "
                                                                   "(approximate every route without a 2010 source)")
    p.add_argument("--gtfs-date", help="network: the weekday to take from the feeds (default: the snapshot date, "
                                       "or the nearest weekday they cover)")
    args = p.parse_args(argv)
    for step in STEPS if args.step == "all" else [args.step]:
        run(step, args)


if __name__ == "__main__":
    main()
