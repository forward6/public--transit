import shapely

from otc_pipeline import curate2010 as c


def test_split_bilingual():
    assert c.split_bilingual("Ottawa River / Rivière des Outaouais", None, None) == (
        "Ottawa River / Rivière des Outaouais", "Ottawa River", "Rivière des Outaouais")
    assert c.split_bilingual("Bank Street", None, None) == ("Bank Street", None, None)


def test_landuse_kinds():
    assert c._landuse_kind("park", "park") == "park"
    assert c._landuse_kind("education", "university") == "campus"
    assert c._landuse_kind("golf", "golf_course") == "golf"
    assert c._landuse_kind("residential", "residential") == "residential"
    assert c._landuse_kind("developed", "industrial") == "commercial"
    assert c._landuse_kind("agriculture", "farmland") == "farmland"
    assert c._landuse_kind("recreation", "playground") is None


def test_in_zone_by_length_and_centroid():
    import numpy as np
    zone = shapely.box(0, 0, 100, 100)
    geoms = np.array([shapely.LineString([(50, 50), (150, 50)]), shapely.Point(10, 10), shapely.Point(500, 500)], dtype=object)
    f = c._in_zone(geoms, zone)
    assert abs(f[0] - 0.5) < 1e-6 and f[1] == 1.0 and f[2] == 0.0


def test_metric_projection_roundtrip():
    p = shapely.Point(-75.7, 45.42)
    back = c.to_ll(c.to_m(p))
    assert abs(back.x - p.x) < 1e-9 and abs(back.y - p.y) < 1e-9
