"""Find and download archived 2010 GTFS feeds from the Internet Archive's Wayback Machine.

    uv run otc-pipeline archive

Queries the Wayback CDX API for ZIP captures of OC Transpo's and STO's feeds (and the old
GTFS Data Exchange mirror) between 2009 and 2012, downloads the capture closest to the
snapshot date for each source, checks it is a GTFS feed, and prints the import command.
Needs web.archive.org to be reachable (see docs: environment network settings).
"""

from __future__ import annotations

import io
import json
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime

from . import config

CDX = "https://web.archive.org/cdx/search/cdx"
QUERIES = {
    "octranspo": [
        {"url": "octranspo.com", "matchType": "domain", "filter": "mimetype:application/zip"},
        {"url": "gtfs-data-exchange.com", "matchType": "domain", "filter": "urlkey:.*oc-transpo.*"},
    ],
    "sto": [
        {"url": "sto.ca", "matchType": "domain", "filter": "mimetype:application/zip"},
        {"url": "gtfs-data-exchange.com", "matchType": "domain", "filter": "urlkey:.*outaouais.*"},
    ],
}


def cdx_url(q: dict, start: int = 2009, end: int = 2012) -> str:
    params = {**q, "from": str(start), "to": str(end), "output": "json", "limit": "500"}
    return f"{CDX}?{urllib.parse.urlencode(params)}"


def candidates(cdx_json: list[list[str]]) -> list[dict]:
    """CDX JSON (header row + rows) -> zip captures with HTTP 200."""
    if not cdx_json:
        return []
    head, rows = cdx_json[0], cdx_json[1:]
    out = []
    for r in rows:
        d = dict(zip(head, r))
        if d.get("statuscode") in ("200", "-") and (d.get("mimetype", "").endswith("zip") or d.get("original", "").endswith(".zip")):
            out.append(d)
    return out


def closest(cands: list[dict], snapshot: str = config.SNAPSHOT_DATE) -> dict | None:
    target = datetime.fromisoformat(snapshot)
    return min(cands, key=lambda d: abs(datetime.strptime(d["timestamp"][:8], "%Y%m%d") - target), default=None)


def _get(url: str, timeout: int = 60) -> bytes:
    with urllib.request.urlopen(url, timeout=timeout) as resp:  # honours HTTPS_PROXY / system CAs
        return resp.read()


def search_and_download() -> dict[str, str]:
    out_dir = config.RAW / "archive"
    out_dir.mkdir(parents=True, exist_ok=True)
    saved: dict[str, str] = {}
    for agency, queries in QUERIES.items():
        cands: list[dict] = []
        for q in queries:
            try:
                cands += candidates(json.loads(_get(cdx_url(q)) or b"[]"))
            except (urllib.error.URLError, OSError) as e:
                print(f"  ! {agency}: cannot reach the Wayback Machine ({e}). Allow web.archive.org in the "
                      f"environment's network settings, then re-run.")
                return saved
        best = closest(cands)
        print(f"  {agency}: {len(cands)} zip capture(s){'; closest ' + best['timestamp'] + ' ' + best['original'] if best else ''}")
        if not best:
            continue
        data = _get(f"https://web.archive.org/web/{best['timestamp']}id_/{best['original']}", timeout=300)
        names = zipfile.ZipFile(io.BytesIO(data)).namelist()
        if not {"stops.txt", "trips.txt", "stop_times.txt"} <= set(names):
            print(f"  ! {agency}: capture is not a GTFS feed ({names[:5]})")
            continue
        path = out_dir / f"{agency}_{best['timestamp'][:8]}.zip"
        path.write_bytes(data)
        saved[agency] = str(path)
        print(f"  saved {path.relative_to(config.REPO)} — import with: uv run otc-pipeline network --gtfs {path}")
    return saved
