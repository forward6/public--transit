import numpy as np

from otc_pipeline import zones


def test_classify_buildings_by_class_land_use_and_size():
    cls = np.array(["detached", "apartments", "commercial", "garage", "", "", "", ""], dtype=object)
    footprint = np.array([150, 900, 2000, 30, 120, 3000, 800, 900], dtype=float)
    h = np.array([7, 30, 40, 3, 6, 9, 30, 6], dtype=float)
    landuse = [None, None, None, None, None, "industrial", None, "residential"]
    kind, floors = zones.classify_buildings(cls, footprint, h, landuse)
    assert list(kind) == ["house", "flats", "office", "", "house", "industrial", "office", "flats"]
    assert floors[1] == 9 and floors[0] == 2


def test_dwellings_by_type():
    assert zones.dwellings("house", 150, 2) == 1.0
    assert zones.dwellings("terrace", 260, 2) == 4.0
    assert zones.dwellings("flats", 850, 10) == 80.0


def test_car_ownership_falls_with_density():
    suburb, core = zones.car_density_share(2500), zones.car_density_share(12000)
    assert 0.03 < suburb < 0.1 and 0.35 < core < 0.46
