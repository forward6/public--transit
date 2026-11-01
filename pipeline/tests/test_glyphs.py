import numpy as np

from otc_pipeline import glyphs


def test_pbf_roundtrip():
    g = [{"id": 65, "width": 2, "height": 2, "left": -1, "top": -8, "advance": 12, "bitmap": bytes(range(64))},
         {"id": 32, "width": 0, "height": 0, "left": 0, "top": -26, "advance": 6, "bitmap": b""}]
    data = glyphs.encode_range("Inter Regular", 0, 255, g)
    back = glyphs.decode_range(data)
    assert [x["id"] for x in back] == [65, 32]
    assert back[0]["left"] == -1 and back[0]["top"] == -8 and back[0]["advance"] == 12
    assert back[0]["bitmap"] == bytes(range(64))


def test_sdf_is_bright_inside_dark_outside():
    a = np.zeros((20, 20))
    a[7:13, 7:13] = 1.0
    d = glyphs.sdf(a)
    assert d.dtype == np.uint8
    assert d[10, 10] > 200  # deep inside
    assert d[0, 0] < 40  # far outside
    edge = d[10, 7]
    assert 150 < edge < 230  # the 0.75 contour (cutoff 0.25) sits just inside the edge
