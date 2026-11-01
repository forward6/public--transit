"""Date OpenStreetMap-derived features: was this already mapped on the snapshot date?

OSM issues element IDs sequentially, separately for nodes, ways and relations. For an element
still at version 1, its last-edit timestamp *is* its creation time. That gives us
(id, created) pairs from the data itself, from which we find the ID threshold that best
separates "created before the snapshot" from "after". Any feature whose oldest OSM element
is below the threshold was already on the map at the snapshot date.

Caveat: a feature mapped *after* the snapshot is not necessarily *built* after it (late
mapping, or a way split into a new ID). ``curate2010`` therefore combines this signal with
spatial context instead of trusting it alone.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict

import numpy as np


@dataclass
class Threshold:
    osm_type: str
    threshold_id: int
    samples: int
    misclassified: float  # share of version-1 samples on the wrong side of the threshold

    def as_dict(self) -> dict:
        return asdict(self)


def calibrate(ids: np.ndarray, created: np.ndarray, snapshot: np.datetime64, osm_type: str) -> Threshold:
    """Pick the ID threshold that minimises misclassified version-1 elements.

    ``ids``: int64 element IDs; ``created``: datetime64 creation times (version-1 elements only).
    """
    if len(ids) == 0:
        raise ValueError(f"no version-1 samples for OSM type {osm_type!r}")
    order = np.argsort(ids, kind="stable")
    ids = ids[order]
    after = (created[order] > snapshot).astype(np.int64)
    # err(k) for threshold between ids[k] and ids[k+1]:
    #   "after" elements at or below k  +  "before" elements above k
    after_below = np.cumsum(after)
    before_above = (1 - after)[::-1].cumsum()[::-1]
    before_above = np.append(before_above[1:], 0)
    err = after_below + before_above
    # also consider "everything is after" (threshold below the first id)
    err_none = int((1 - after).sum())
    k = int(np.argmin(err))
    if err_none < err[k]:
        return Threshold(osm_type, int(ids[0]) - 1, len(ids), err_none / len(ids))
    return Threshold(osm_type, int(ids[k]), len(ids), float(err[k]) / len(ids))


def mapped_by_snapshot(osm_type, osm_id, thresholds: dict[str, Threshold]) -> np.ndarray:
    """Vectorised: True where the oldest OSM element existed at the snapshot.

    Returns a float array: 1.0 (yes), 0.0 (no), NaN (no OSM provenance / unknown type).
    """
    osm_type = np.asarray(osm_type, dtype=object)
    osm_id = np.asarray(osm_id, dtype="float64")
    out = np.full(len(osm_id), np.nan)
    for t, th in thresholds.items():
        m = (osm_type == t) & ~np.isnan(osm_id)
        out[m] = (osm_id[m] <= th.threshold_id).astype(float)
    return out


def samples_from_columns(osm_type, osm_id, osm_version, osm_time) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    """Group version-1 (id, created) pairs by OSM type."""
    osm_type = np.asarray(osm_type, dtype=object)
    osm_version = np.asarray(osm_version, dtype="float64")
    out: dict[str, tuple[list, list]] = {}
    for t, i, v, ts in zip(osm_type, osm_id, osm_version, osm_time):
        if t is None or v != 1 or ts is None or i is None:
            continue
        ids, times = out.setdefault(t, ([], []))
        ids.append(int(i))
        times.append(np.datetime64(ts.replace("Z", "")))
    return {t: (np.array(i, dtype=np.int64), np.array(ts, dtype="datetime64[s]")) for t, (i, ts) in out.items()}
