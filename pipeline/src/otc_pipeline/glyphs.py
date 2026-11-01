"""SDF label glyphs (MapLibre glyph PBFs) for the design's fonts.

Downloads Inter and Source Serif 4 from the npm registry (Fontsource packages, SIL OFL 1.1),
renders each code point with FreeType at 24 px, converts it to a signed distance field with the
same algorithm and parameters as Mapbox/MapLibre tooling (TinySDF: buffer 3, radius 8,
cutoff 0.25), and writes ``apps/web/public/glyphs/{fontstack}/{start}-{end}.pbf``.

The metric conventions (left/top/advance) match node-fontnik, which is what MapLibre expects
from server glyphs; ``tests/test_glyphs.py`` checks this against a reference PBF.
"""

from __future__ import annotations

import io
import json
import tarfile
import urllib.request
from functools import lru_cache
from pathlib import Path

import freetype
import numpy as np
from fontTools.ttLib import TTFont

from . import config

SIZE, BUFFER, RADIUS, CUTOFF = 24, 3, 8, 0.25
RANGES = [(0, 255), (256, 511), (8192, 8447)]  # Basic Latin + Latin-1, Latin Extended-A, punctuation

# fontstack name -> (npm package, version, weight, style)
FONTS = {
    "Inter Regular": ("@fontsource/inter", "5.3.0", 400, "normal"),
    "Inter SemiBold": ("@fontsource/inter", "5.3.0", 600, "normal"),
    "Inter Bold": ("@fontsource/inter", "5.3.0", 700, "normal"),
    "Source Serif 4 Italic": ("@fontsource/source-serif-4", "5.3.1", 400, "italic"),
    "Source Serif 4 SemiBold": ("@fontsource/source-serif-4", "5.3.1", 600, "normal"),
}
SUBSETS = ["latin", "latin-ext"]


# ------------------------------------------------------------------------------- font sources

@lru_cache(maxsize=None)
def _package_files(pkg: str, version: str) -> dict[str, bytes]:
    cache = config.RAW / "fonts" / f"{pkg.replace('/', '__')}-{version}.tgz"
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        meta = json.load(urllib.request.urlopen(f"https://registry.npmjs.org/{pkg}/{version}"))
        cache.write_bytes(urllib.request.urlopen(meta["dist"]["tarball"]).read())
    out = {}
    with tarfile.open(cache) as tf:
        for m in tf.getmembers():
            if m.name.endswith(".woff2"):
                out[Path(m.name).name] = tf.extractfile(m).read()
    return out


def _ttf_from_woff2(data: bytes) -> bytes:
    f = TTFont(io.BytesIO(data))
    f.flavor = None
    buf = io.BytesIO()
    f.save(buf)
    return buf.getvalue()


@lru_cache(maxsize=None)
def font_faces(stack: str) -> list[freetype.Face]:
    pkg, version, weight, style = FONTS[stack]
    files = _package_files(pkg, version)
    base = pkg.split("/")[-1]
    faces = []
    for subset in SUBSETS:
        name = f"{base}-{subset}-{weight}-{style}.woff2"
        if name not in files:
            raise FileNotFoundError(f"{name} not in {pkg}@{version}")
        face = freetype.Face(io.BytesIO(_ttf_from_woff2(files[name])))
        face.set_char_size(SIZE * 64)
        faces.append(face)
    return faces


# ----------------------------------------------------------------------------------------- SDF

INF = 1e20


def _edt1d(f: np.ndarray) -> np.ndarray:
    """1-D squared Euclidean distance transform (Felzenszwalb & Huttenlocher)."""
    n = len(f)
    d = np.zeros(n)
    v = np.zeros(n, dtype=int)
    z = np.zeros(n + 1)
    k = 0
    v[0] = 0
    z[0], z[1] = -INF, INF
    for q in range(1, n):
        s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
        while s <= z[k]:
            k -= 1
            s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
        k += 1
        v[k] = q
        z[k] = s
        z[k + 1] = INF
    k = 0
    for q in range(n):
        while z[k + 1] < q:
            k += 1
        d[q] = (q - v[k]) ** 2 + f[v[k]]
    return d


def _edt(grid: np.ndarray) -> np.ndarray:
    g = grid.copy()
    for x in range(g.shape[1]):
        g[:, x] = _edt1d(g[:, x])
    for y in range(g.shape[0]):
        g[y, :] = _edt1d(g[y, :])
    return g


def sdf(alpha: np.ndarray) -> np.ndarray:
    """TinySDF: alpha coverage (0..1, already padded by BUFFER) -> uint8 SDF."""
    outer = np.where(alpha >= 1, 0.0, np.where(alpha <= 0, INF, np.maximum(0, 0.5 - alpha) ** 2))
    inner = np.where(alpha >= 1, INF, np.where(alpha <= 0, 0.0, np.maximum(0, alpha - 0.5) ** 2))
    d = np.sqrt(_edt(outer)) - np.sqrt(_edt(inner))
    return np.clip(np.round(255 - 255 * (d / RADIUS + CUTOFF)), 0, 255).astype(np.uint8)


def render_glyph(faces: list[freetype.Face], cp: int) -> dict | None:
    face = next((f for f in faces if f.get_char_index(cp)), None)
    if face is None:
        return None
    face.load_char(chr(cp), freetype.FT_LOAD_RENDER | freetype.FT_LOAD_NO_HINTING)
    slot = face.glyph
    bm = slot.bitmap
    w, h = bm.width, bm.rows
    ascender = face.size.ascender / 64.0
    advance = slot.advance.x // 64  # node-fontnik truncates (horiAdvance / 64)
    glyph = {"id": cp, "width": w, "height": h, "left": slot.bitmap_left,
             "top": slot.bitmap_top - int(round(ascender)), "advance": advance, "bitmap": b""}
    if w and h:
        a = np.array(bm.buffer, dtype=np.uint8).reshape(h, bm.pitch)[:, :w] / 255.0
        padded = np.zeros((h + 2 * BUFFER, w + 2 * BUFFER))
        padded[BUFFER:BUFFER + h, BUFFER:BUFFER + w] = a
        glyph["bitmap"] = sdf(padded).tobytes()
    return glyph


# ------------------------------------------------------------------------------------ protobuf

def _varint(n: int) -> bytes:
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        out.append(b | (0x80 if n else 0))
        if not n:
            return bytes(out)


def _zigzag(n: int) -> int:
    return (n << 1) ^ (n >> 63)


def _field_bytes(num: int, data: bytes) -> bytes:
    return _varint((num << 3) | 2) + _varint(len(data)) + data


def _field_varint(num: int, value: int) -> bytes:
    return _varint(num << 3) + _varint(value)


def encode_range(stack: str, start: int, end: int, glyphs: list[dict]) -> bytes:
    body = _field_bytes(1, stack.encode()) + _field_bytes(2, f"{start}-{end}".encode())
    for g in glyphs:
        gb = _field_varint(1, g["id"])
        if g["bitmap"]:
            gb += _field_bytes(2, g["bitmap"])
        gb += _field_varint(3, g["width"]) + _field_varint(4, g["height"])
        gb += _field_varint(5, _zigzag(g["left"])) + _field_varint(6, _zigzag(g["top"])) + _field_varint(7, g["advance"])
        body += _field_bytes(3, gb)
    return _field_bytes(1, body)


def decode_range(data: bytes) -> list[dict]:
    """Minimal decoder (for tests / calibration)."""
    def read_varint(b, i):
        shift = result = 0
        while True:
            c = b[i]
            i += 1
            result |= (c & 0x7F) << shift
            shift += 7
            if not c & 0x80:
                return result, i

    def fields(b):
        i = 0
        while i < len(b):
            key, i = read_varint(b, i)
            num, wt = key >> 3, key & 7
            if wt == 0:
                v, i = read_varint(b, i)
            elif wt == 2:
                ln, i = read_varint(b, i)
                v, i = b[i:i + ln], i + ln
            else:
                raise ValueError(f"wire type {wt}")
            yield num, v

    unzz = lambda n: (n >> 1) ^ -(n & 1)  # noqa: E731
    glyphs = []
    for num, stack in fields(data):
        if num != 1:
            continue
        for n2, v2 in fields(stack):
            if n2 != 3:
                continue
            g = {"bitmap": b""}
            for n3, v3 in fields(v2):
                key = {1: "id", 2: "bitmap", 3: "width", 4: "height", 5: "left", 6: "top", 7: "advance"}[n3]
                g[key] = unzz(v3) if n3 in (5, 6) else v3
            glyphs.append(g)
    return glyphs


def build_glyphs(out_dir: Path | None = None) -> None:
    out_dir = out_dir or config.WEB_GLYPHS
    for stack in FONTS:
        faces = font_faces(stack)
        d = out_dir / stack
        d.mkdir(parents=True, exist_ok=True)
        n = 0
        for start, end in RANGES:
            glyphs = [g for g in (render_glyph(faces, cp) for cp in range(start, end + 1)) if g]
            (d / f"{start}-{end}.pbf").write_bytes(encode_range(stack, start, end, glyphs))
            n += len(glyphs)
        print(f"  {stack}: {n} glyphs")
    (out_dir / "LICENSE.md").write_text(
        "Glyph files generated from Inter (© The Inter Project Authors) and Source Serif 4 (© Adobe), "
        "both under the SIL Open Font License 1.1 (https://openfontlicense.org). "
        "Generated by pipeline/src/otc_pipeline/glyphs.py.\n")
