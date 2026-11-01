import numpy as np

from otc_pipeline import dating


def test_calibrate_finds_boundary_between_eras():
    rng = np.random.default_rng(1)
    ids = np.arange(1, 10_001, dtype=np.int64)
    # ids <= 6000 created before the snapshot, the rest after (with a little noise near the edge)
    created = np.where(ids <= 6000, np.datetime64("2009-06-01"), np.datetime64("2015-06-01"))
    noisy = rng.choice(np.arange(5900, 6100), 10, replace=False)
    created[noisy - 1] = np.where(created[noisy - 1] == np.datetime64("2009-06-01"),
                                  np.datetime64("2015-06-01"), np.datetime64("2009-06-01"))
    th = dating.calibrate(ids, created.astype("datetime64[s]"), np.datetime64("2010-12-01"), "w")
    assert 5900 <= th.threshold_id <= 6100
    assert th.misclassified < 0.01


def test_mapped_by_snapshot_handles_types_and_missing():
    th = {"w": dating.Threshold("w", 100, 10, 0.0), "r": dating.Threshold("r", 5, 10, 0.0)}
    out = dating.mapped_by_snapshot(["w", "w", "r", None, "n"], [50, 150, 4, None, 1], th)
    assert out[0] == 1 and out[1] == 0 and out[2] == 1
    assert np.isnan(out[3]) and np.isnan(out[4])


def test_samples_only_use_version_one():
    s = dating.samples_from_columns(["w", "w", "r"], [1, 2, 3], [1, 2, 1],
                                    ["2009-01-01T00:00:00Z", "2020-01-01T00:00:00Z", "2011-01-01T00:00:00Z"])
    assert list(s["w"][0]) == [1]
    assert list(s["r"][0]) == [3]
