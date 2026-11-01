"""Wikipedia as a dated archive: articles exactly as they stood on the snapshot date.

    uv run otc-pipeline wiki

Fetches the last revision at or before 1 December 2010 of the articles below (cached in
data/raw/wiki/, polite User-Agent, backs off on HTTP 429), then extracts:

* the **2010 route catalogue** — every OC Transpo route (number, fare class, termini) from
  "OC Transpo routes" and every STO route from the French STO article
  -> data/build/2010/route_catalogue.json (facts only; source revision recorded per entry)
* the **2010 Transitway station list** by segment -> data/build/2010/transitway_stations.json

Text is © Wikipedia contributors (CC BY-SA 4.0); only factual data is extracted.
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from . import config

UA = "OTC-pipeline/0.1 (transit simulator research; https://github.com/forward6/public--transit)"

ARTICLES = {
    "oct_routes": ("en", "OC Transpo routes"),
    "transitway": ("en", "Transitway (Ottawa)"),
    "octranspo": ("en", "OC Transpo"),
    "route_95": ("en", "OC Transpo Route 95"),
    "route_97": ("en", "OC Transpo Route 97"),
    "sto_fr": ("fr", "Société de transport de l'Outaouais"),
}

# fare colour sections of the 2010 OC Transpo routes article -> catalogue class
OCT_SECTIONS = {
    "Black Routes (Regular Fare)": "regular",
    "Red routes (Peak Periods / Regular Fare)": "peak",
    "Green routes (Peak Periods / Extra Fare)": "express",
    "Scotiabank Place 'Connexion 400' Routes": "event",
    "Rural partner routes": "rural",
    "School routes": "school",
    "Early morning routes": "early",
}
STO_SECTIONS = {
    "Circuits réguliers": "regular",
    "Circuits réguliers - Heures de pointe": "peak",
    "Circuits Express": "express",
    "Circuits interzones": "interzone",
    "Circuits scolaires": "school",
    "Circuits partenaires par secteurs ou villes": "partner",
}


def revision_url(lang: str, revid: int) -> str:
    return f"https://{lang}.wikipedia.org/w/index.php?oldid={revid}"


def fetch_revision(lang: str, title: str, at: str | None = None, cache: Path | None = None) -> dict | None:
    """Last revision of ``title`` at or before ``at`` (ISO time). Cached as JSON."""
    at = at or f"{config.SNAPSHOT_DATE}T00:00:00Z"
    cache = cache or (config.RAW / "wiki")
    cache.mkdir(parents=True, exist_ok=True)
    key = cache / f"{lang}__{re.sub(r'[^A-Za-z0-9]+', '_', title)}__{at[:10]}.json"
    if key.exists():
        return json.loads(key.read_text())
    q = {"action": "query", "prop": "revisions", "titles": title, "rvlimit": "1", "rvstart": at, "rvdir": "older",
         "rvprop": "ids|timestamp|content", "rvslots": "main", "format": "json", "formatversion": "2"}
    url = f"https://{lang}.wikipedia.org/w/api.php?" + urllib.parse.urlencode(q)
    for attempt in range(7):
        try:
            d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60))
            break
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(6 * (attempt + 1))
                continue
            raise
    else:
        raise RuntimeError(f"{lang}:{title}: rate-limited by Wikipedia, try again later")
    page = d["query"]["pages"][0]
    if "missing" in page or "revisions" not in page:
        return None
    r = page["revisions"][0]
    out = {"lang": lang, "title": page["title"], "revid": r["revid"], "timestamp": r["timestamp"],
           "url": revision_url(lang, r["revid"]), "text": r["slots"]["main"]["content"]}
    key.write_text(json.dumps(out, ensure_ascii=False))
    time.sleep(1.5)
    return out


# ------------------------------------------------------------------------------------------ parsing

def clean(s: str) -> str:
    s = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"<br\s*/?>", " / ", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("'''", "").replace("''", "")
    return re.sub(r"\s+", " ", s).strip()


def _sections(text: str, level: int) -> list[tuple[str, str]]:
    eq = "=" * level
    parts = re.split(rf"\n{eq}\s*([^=].*?)\s*{eq}\s*\n", "\n" + text)
    return [(parts[i].strip(), parts[i + 1]) for i in range(1, len(parts), 2)]


def _rows(body: str) -> list[list[str]]:
    """Wikitable rows -> cleaned cells (header cells and colour-only cells dropped)."""
    rows = []
    for r in body.split("\n|-")[1:]:
        r = r.split("\n|}")[0]
        cells = []
        for c in re.split(r"\n\|(?!-)", "\n" + r)[1:]:
            c = re.sub(r'^\s*(?:rowspan|colspan|bgcolor|style)\s*=\s*"?[^|"]*"?\s*\|', "", c)
            if re.match(r'^\s*bgcolor', c):
                continue
            cells.append(clean(c))
        if cells:
            rows.append(cells)
    return rows


def _route_no(cell: str) -> str | None:
    m = re.match(r"^([A-Z]?\d{1,3}[A-Z]?)$", cell.strip())
    return m.group(1) if m else None


def parse_oct_routes(text: str) -> list[dict]:
    out = []
    for name, body in _sections(text, 2):
        cls = OCT_SECTIONS.get(name)
        if not cls:
            continue
        for cells in _rows(body):
            cells = [c for c in cells if c]
            if not cells or not (no := _route_no(cells[0])):
                continue
            termini = [t.strip() for c in cells[1:3] for t in c.split(" / ") if t.strip()]
            out.append({"agency": "octranspo", "number": no, "class": cls, "termini": termini})
    return out


def parse_sto_routes(text: str) -> list[dict]:
    out = []
    for name, body in _sections(text, 3):
        cls = STO_SECTIONS.get(name)
        if not cls:
            continue
        last_dest = None
        for cells in _rows(body):
            if not cells or not (no := _route_no(cells[0])):
                continue
            # rowspan'd destination cells are absent on following rows; keep the previous one
            dep = cells[1] if len(cells) > 1 else ""
            dest = cells[2] if len(cells) > 3 else last_dest
            if len(cells) > 3:
                last_dest = cells[2]
            termini = [t for t in (dep, dest) if t and len(t) < 160]
            out.append({"agency": "sto", "number": no, "class": cls, "termini": termini})
    return out


def parse_transitway_stations(text: str) -> dict[str, list[str]]:
    """'Rapid transit stations' section -> {segment heading: [station, ...]} in article order."""
    sec = text.split("==Rapid transit stations==")[-1].split("\n===Ottawa O-Train===")[0]
    out: dict[str, list[str]] = {}
    for heading, body in _sections(sec, 4):
        names = []
        for line in body.split("\n"):
            m = re.match(r"^\*\s*\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", line.strip())
            if m:
                names.append(clean(m.group(1)))
        out[heading] = names
    return out


def build_wiki() -> dict:
    config.ensure_dirs()
    revs = {}
    for key, (lang, title) in ARTICLES.items():
        r = fetch_revision(lang, title)
        if r is None:
            print(f"  {lang}:{title}: no revision before {config.SNAPSHOT_DATE}")
            continue
        revs[key] = r
        print(f"  {lang}:{r['title']} — rev {r['revid']} ({r['timestamp'][:10]}), {len(r['text']):,} chars")
    catalogue = []
    if "oct_routes" in revs:
        for e in parse_oct_routes(revs["oct_routes"]["text"]):
            catalogue.append(e | {"source": revs["oct_routes"]["url"]})
    if "sto_fr" in revs:
        for e in parse_sto_routes(revs["sto_fr"]["text"]):
            catalogue.append(e | {"source": revs["sto_fr"]["url"]})
    stations = parse_transitway_stations(revs["transitway"]["text"]) if "transitway" in revs else {}
    out = config.BUILD / "2010"
    out.mkdir(parents=True, exist_ok=True)
    (out / "route_catalogue.json").write_text(json.dumps(catalogue, ensure_ascii=False, indent=1))
    (out / "transitway_stations.json").write_text(json.dumps(
        {"source": revs.get("transitway", {}).get("url"), "segments": stations}, ensure_ascii=False, indent=1))
    by = {}
    for e in catalogue:
        by.setdefault((e["agency"], e["class"]), 0)
        by[(e["agency"], e["class"])] += 1
    print("  catalogue:", ", ".join(f"{a}/{c} {n}" for (a, c), n in sorted(by.items())))
    print("  transitway stations:", {k: len(v) for k, v in stations.items()})
    return {"catalogue": catalogue, "stations": stations, "revisions": {k: (v["revid"], v["timestamp"]) for k, v in revs.items()}}
