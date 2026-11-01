"""``otc-pipeline`` command line: run one step or ``all``.

Steps (in order):
  fetch     download Overture Maps data for the region            -> data/raw/overture/*.parquet
  curate    reconstruct the city as of 1 December 2010            -> data/build/2010/*.parquet + data/reports/
  terrain   NRCan CDEM elevation -> Terrarium-encoded raster tiles -> apps/web/public/data/terrain.pmtiles
  tiles     vector tiles for the base map                         -> apps/web/public/data/basemap-2010.pmtiles
  glyphs    SDF label glyphs (Inter, Source Serif 4)              -> apps/web/public/glyphs/
"""

from __future__ import annotations

import argparse
import time

STEPS = ["fetch", "curate", "terrain", "tiles", "glyphs"]


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
    print(f"== {step} done in {time.time() - t0:.0f}s")


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="otc-pipeline", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("step", choices=STEPS + ["all"])
    p.add_argument("--layers", help="fetch: comma-separated subset of layers")
    p.add_argument("--workers", type=int, default=0, help="tiles: worker processes (default: CPU count)")
    args = p.parse_args(argv)
    for step in STEPS if args.step == "all" else [args.step]:
        run(step, args)


if __name__ == "__main__":
    main()
