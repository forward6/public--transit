"""Find and download archived 2010 GTFS feeds from the Internet Archive's Wayback Machine.

    uv run otc-pipeline archive                                # -> data/raw/archive/
    python3 pipeline/src/otc_pipeline/archive.py --out DIR     # standalone: standard library only

Runs anywhere that can reach web.archive.org. The cloud build environment cannot, so GitHub
Actions runs it (.github/workflows/archive-2010.yml) and publishes the result to the
``data/gtfs-2010`` branch.

1. Asks the Wayback CDX index for ZIP captures from where the 2010 feeds were published:
   OC Transpo's site (www.octranspo1.com at the time), the City of Ottawa's open-data pages,
   STO's site, and the GTFS Data Exchange, which kept dated copies of every feed version on S3.
2. Ranks them by how close their date is to the snapshot. The date comes from the file name
   where it has one (GTFS Data Exchange copies), otherwise from the capture.
3. Downloads the best few per agency and opens each one. It must be a GTFS feed of the right
   agency, and its calendar should run weekday service on the snapshot date (1 December 2010).
4. Keeps the best feed per agency and writes report.json, which lists every candidate and check.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

SNAPSHOT = date(2010, 12, 1)
CDX = "https://web.archive.org/cdx/search/cdx"
UA = "OTC-pipeline/0.1 (transit simulator research; https://github.com/forward6/public--transit)"
ZIP = r"original:.*\.[zZ][iI][pP]([?#].*)?"

# Where the 2010 feeds could have been published. "dated": the file name carries the feed's date
# (GTFS Data Exchange copies on S3); otherwise a capture is the feed as it stood on the capture date.
SOURCES: dict[str, dict] = {
    "octranspo": {
        "agency": r"oc\s*transpo|ottawa",
        "queries": [
            {"url": "octranspo1.com", "matchType": "domain", "filter": ZIP, "years": (2009, 2012)},
            {"url": "octranspo.com", "matchType": "domain", "filter": ZIP, "years": (2009, 2012)},
            {"url": "gtfs.s3.amazonaws.com/oc-transpo", "matchType": "prefix", "dated": True},
            {"url": "gtfs-data-exchange.com/agency/oc-transpo/", "matchType": "prefix", "filter": ZIP},
            {"url": "ottawa.ca", "matchType": "domain", "years": (2009, 2012),
             "filter": r"original:.*([Tt]ransit|[Tt]ranspo|[Gg][Tt][Ff][Ss]).*\.[zZ][iI][pP].*"},
        ],
    },
    "sto": {
        "agency": r"outaouais|\bsto\b",
        "queries": [
            {"url": "sto.ca", "matchType": "domain", "filter": ZIP, "years": (2009, 2013)},
            {"url": "gtfs.s3.amazonaws.com/societe-de-transport-de-l-outaouais", "matchType": "prefix", "dated": True},
            {"url": "gtfs.s3.amazonaws.com/sto", "matchType": "prefix", "dated": True},
            {"url": "gtfs-data-exchange.com/agency/societe-de-transport-de-l-outaouais/", "matchType": "prefix",
             "filter": ZIP},
        ],
    },
}
DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


# ------------------------------------------------------------------------------------------ index

def cdx_url(q: dict) -> str:
    params = {"url": q["url"], "matchType": q.get("matchType", "exact"), "output": "json", "limit": "2000",
              "fl": "timestamp,original,mimetype,statuscode,digest,length", "collapse": "digest"}
    if q.get("filter"):
        params["filter"] = q["filter"]
    if q.get("years"):
        params["from"], params["to"] = str(q["years"][0]), str(q["years"][1])
    return f"{CDX}?{urllib.parse.urlencode(params)}"


def _name_date(url: str) -> date | None:
    m = re.search(r"(20[01]\d)(\d\d)(\d\d)", url.rsplit("/", 1)[-1])
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None
    except ValueError:
        return None


def candidates(cdx_json: list[list[str]], dated: bool = False) -> list[dict]:
    """CDX JSON (header row + rows) -> successful .zip captures, each with an estimated feed ``date``."""
    if not cdx_json:
        return []
    head, rows = cdx_json[0], cdx_json[1:]
    out = []
    for r in rows:
        d = dict(zip(head, r))
        if d.get("statuscode") not in ("200", "-") or ".zip" not in d.get("original", "").lower():
            continue
        named = _name_date(d["original"]) if dated else None
        d["date"] = (named or datetime.strptime(d["timestamp"][:8], "%Y%m%d").date()).isoformat()
        d["dated_by"] = "file name" if named else "capture"
        out.append(d)
    return out


def rank(cands: list[dict], snapshot: date = SNAPSHOT) -> list[dict]:
    """Closest to the snapshot first; one entry per distinct content (digest)."""
    best: dict[str, dict] = {}
    for c in sorted(cands, key=lambda c: abs((date.fromisoformat(c["date"]) - snapshot).days)):
        best.setdefault(c.get("digest") or c["original"], c)
    return list(best.values())


def closest(cands: list[dict], snapshot: date = SNAPSHOT) -> dict | None:
    r = rank(cands, snapshot)
    return r[0] if r else None


# ------------------------------------------------------------------------------------------ feeds

def _rows(z: zipfile.ZipFile, name: str) -> list[dict]:
    if name not in z.namelist():
        return []
    with z.open(name) as f:
        return list(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig", errors="replace")))


def _ymd(s: str) -> date | None:
    s = (s or "").strip()
    try:
        return date(int(s[:4]), int(s[4:6]), int(s[6:8]))
    except ValueError:
        return None


def flatten(data: bytes) -> bytes:
    """Feeds zipped inside a folder -> the same files at the root (where GTFS readers expect them)."""
    z = zipfile.ZipFile(io.BytesIO(data))
    if "stops.txt" in z.namelist():
        return data
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as out:
        for n in z.namelist():
            if n.endswith(".txt") and "__MACOSX" not in n:
                out.writestr(n.rsplit("/", 1)[-1], z.read(n))
    return buf.getvalue()


def inspect_feed(data: bytes, snapshot: date = SNAPSHOT) -> dict:
    """What a downloaded zip is: GTFS or not, whose, which dates, and whether it runs on ``snapshot``."""
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        return {"gtfs": False, "why": "not a zip file"}
    files = {n.rsplit("/", 1)[-1] for n in z.namelist()}
    if not {"stops.txt", "trips.txt", "stop_times.txt"} <= files:
        return {"gtfs": False, "why": f"no GTFS tables ({sorted(files)[:6]})"}
    z = zipfile.ZipFile(io.BytesIO(flatten(data)))
    agencies = [a.get("agency_name", "").strip() for a in _rows(z, "agency.txt")]
    cal = _rows(z, "calendar.txt")
    dates = _rows(z, "calendar_dates.txt")
    spans = [(s, e) for c in cal if (s := _ymd(c.get("start_date"))) and (e := _ymd(c.get("end_date")))]
    added = [d for c in dates if c.get("exception_type") == "1" and (d := _ymd(c.get("date")))]
    first = min([s for s, _ in spans] + added, default=None)
    last = max([e for _, e in spans] + added, default=None)
    day = DAYS[snapshot.weekday()]
    running = {c["service_id"] for c in cal if c.get(day) == "1" and (s := _ymd(c.get("start_date")))
               and (e := _ymd(c.get("end_date"))) and s <= snapshot <= e}
    for c in dates:
        if _ymd(c.get("date")) == snapshot:
            (running.add if c.get("exception_type") == "1" else running.discard)(c.get("service_id"))
    if first and last:
        gap = 0 if first <= snapshot <= last else min(abs((first - snapshot).days), abs((last - snapshot).days))
    else:
        gap = None
    return {"gtfs": True, "agencies": agencies, "service_from": first and first.isoformat(),
            "service_to": last and last.isoformat(), "runs_on_snapshot": bool(running), "days_from_snapshot": gap,
            "routes": len(_rows(z, "routes.txt")), "has_shapes": "shapes.txt" in files, "bytes": len(data)}


def better(a: dict | None, b: dict) -> bool:
    """Is checked feed ``b`` a better choice than ``a``? Runs on the snapshot date, then closest dates."""
    if a is None:
        return True
    ka = (not a["runs_on_snapshot"], a["days_from_snapshot"] if a["days_from_snapshot"] is not None else 10**6)
    kb = (not b["runs_on_snapshot"], b["days_from_snapshot"] if b["days_from_snapshot"] is not None else 10**6)
    return kb < ka


# ------------------------------------------------------------------------------------------ network

def _get(url: str, timeout: int = 120, attempts: int = 6) -> bytes:
    for k in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as resp:  # honours HTTPS_PROXY
                data = resp.read()
            time.sleep(1.0)  # be gentle with the Archive
            return data
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or k == attempts - 1:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
            if k == attempts - 1:
                raise
        time.sleep(min(60, 5 * 2**k))
    raise RuntimeError("unreachable")


def search_and_download(out_dir: Path | str | None = None, snapshot: date = SNAPSHOT, tries: int = 6) -> dict[str, str]:
    if out_dir is None:
        from . import config  # only when run through the package (otc-pipeline archive)
        out_dir = config.RAW / "archive"
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    report: dict = {"snapshot": snapshot.isoformat(), "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "agencies": {}}
    saved: dict[str, str] = {}
    for agency, src in SOURCES.items():
        rep = report["agencies"][agency] = {"queries": [], "checked": [], "chosen": None}
        cands: list[dict] = []
        for q in src["queries"]:
            try:
                found = candidates(json.loads(_get(cdx_url(q)) or b"[]"), dated=q.get("dated", False))
                rep["queries"].append({"url": q["url"], "found": len(found)})
                print(f"  {agency}: {q['url']}: {len(found)} zip capture(s)", flush=True)
                cands += found
            except Exception as e:  # one failing query should not stop the others
                rep["queries"].append({"url": q["url"], "error": str(e)})
                print(f"  {agency}: {q['url']}: ! {e}", flush=True)
        ranked = rank(cands, snapshot)
        rep["candidates"] = ranked[:60]
        best_data, best = None, None
        for c in ranked[:tries]:
            url = f"https://web.archive.org/web/{c['timestamp']}id_/{c['original']}"
            try:
                data = _get(url, timeout=600)
                info = inspect_feed(data, snapshot)
            except Exception as e:
                info = {"gtfs": False, "why": f"download failed: {e}"}
            if info.get("gtfs") and not re.search(src["agency"], " ".join(info["agencies"]), re.I):
                info = {**info, "gtfs": False, "why": f"another agency's feed ({info['agencies']})"}
            entry = {"original": c["original"], "timestamp": c["timestamp"], "date": c["date"],
                     "dated_by": c["dated_by"], "wayback": url, **info}
            rep["checked"].append(entry)
            print(f"  {agency}: {c['date']} {c['original']} -> " + (
                f"GTFS {info['service_from']}..{info['service_to']}, runs on {snapshot}: {info['runs_on_snapshot']}"
                if info.get("gtfs") else info["why"]), flush=True)
            if info.get("gtfs") and better(best, entry):
                best, best_data = entry, data
            if best and best["runs_on_snapshot"]:
                break
        if best and best_data:
            path = out_dir / f"{agency}_{best['date'].replace('-', '')}.zip"
            path.write_bytes(flatten(best_data))
            best["file"] = path.name
            rep["chosen"] = best
            saved[agency] = str(path)
            print(f"  {agency}: saved {path}", flush=True)
        else:
            print(f"  {agency}: no 2010 GTFS feed found", flush=True)
    (out_dir / "report.json").write_text(json.dumps(report, indent=1, ensure_ascii=False))
    return saved


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", default="gtfs-2010", help="output directory (default: ./gtfs-2010)")
    p.add_argument("--tries", type=int, default=6, help="feeds to download and check per agency (default 6)")
    args = p.parse_args(argv)
    saved = search_and_download(args.out, tries=args.tries)
    print(f"done: {', '.join(saved) or 'no feeds'} -> {args.out}/ (see report.json)")


if __name__ == "__main__":
    sys.exit(main())
