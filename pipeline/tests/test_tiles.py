import numpy as np
import shapely

from otc_pipeline import pmt, tiles


def test_tile_bounds_and_cover():
    minx, miny, maxx, maxy = pmt.tile_bounds(0, 0, 0)
    assert abs(maxx - minx - pmt.WORLD) < 1e-6
    cover = pmt.tiles_for_bbox((-75.8, 45.3, -75.6, 45.5), 12)
    assert all(z == 12 for z, _, _ in cover) and len(cover) >= 4
    x, y = pmt.lonlat_to_tile(-75.7, 45.42, 12)
    assert (12, x, y) in cover


def test_to_merc_known_point():
    p = pmt.to_merc(shapely.Point(-75.7, 45.42))
    assert abs(p.x - -8426700) < 1000 and abs(p.y - 5687900) < 2000


def test_area_minzoom_is_monotonic():
    z = tiles.area_minzoom(np.array([1e2, 1e4, 1e6, 1e8]), 2.0, 7)
    assert list(z) == sorted(z, reverse=True)
    assert z.min() >= 7 and z.max() <= 14
