#!/usr/bin/env python3
"""
Card images via accio.cards. Our localizations.en.image.file IS the accio filename
(both come from hpjson), so the URL is just BASE + file — no Drive, no name matching.

Two modes:
  --link   (default here)  set image.url to the remote accio URL (hotlink). Instant,
                           covers every set incl. Chamber of Secrets. No download.
  --download               download each image, convert to WebP and save it LOCALLY as
                           assets/cards/<id>.webp (q100) + thumb/<id>.webp (q90), then
                           set image.url to the local path. Run this on your machine to
                           self-host. (Needs Pillow; without it, source files are saved
                           as-is with no WebP/thumbnail.)

Usage:
  python3 accio_images.py                        # link mode (rewrites dist/cards.json + per-lang)
  python3 accio_images.py --download             # self-host as WebP (parallel; needs network + Pillow)
  python3 accio_images.py --download --workers 16 # more threads = faster (default 8)

Note: card art is © Warner Bros. We use it under the unofficial-fan-project terms
(disclaimer, non-commercial, takedown). For production prefer --download + CDN.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, "dist")
ASSETS = os.path.join(HERE, "assets")
BASE = "https://accio.cards/cardimages/"    # primary; accio splits art across two folders
BASES = ["https://accio.cards/cardimages/", "https://accio.cards/cardimages2/", "https://accio.cards/cardimages3/"]
DOWNLOAD = "--download" in sys.argv
FULL_W, THUMB_W = 745, 300   # THUMB_W = max thumbnail width (grid tile)
# WebP output: full cards at q100 (highest lossy), thumbs at q85. method=6 = best
# compression (slower, but this is a one-time local batch). Alpha (rounded/transparent
# card corners) is preserved. Needs Pillow.
WEBP_FULL_Q, WEBP_THUMB_Q, WEBP_METHOD = 100, 85, 6

def _arg_workers(default=8):
    """Parse `--workers N` / `--workers=N` from argv (parallel download threads)."""
    for i, a in enumerate(sys.argv):
        if a.startswith("--workers="):
            return max(1, int(a.split("=", 1)[1]))
        if a == "--workers" and i + 1 < len(sys.argv):
            return max(1, int(sys.argv[i + 1]))
    return default
WORKERS = _arg_workers()

def link_mode(cards):
    n = 0
    for c in cards:
        f = c["localizations"]["en"]["image"].get("file")
        if f:
            c["localizations"]["en"]["image"]["url"] = BASE + f
            n += 1
    return n

def load_overrides():
    """Optional id -> correct accio filename, for typos/mismatches in the source data."""
    p = os.path.join(HERE, "image_overrides.json")
    if os.path.exists(p):
        return {k: v for k, v in json.load(open(p, encoding="utf-8")).items() if v}
    return {}

def _process_one(c, overrides, Image):
    """Fetch + convert a single card. Returns (status, id, error). Thread-safe:
    only touches its own card object and its own files."""
    import urllib.request, urllib.error, io, time
    f = overrides.get(c["id"]) or c["localizations"]["en"]["image"].get("file")
    if not f:
        return ("skip", c["id"], None)
    if Image is not None:
        full_path = os.path.join(ASSETS, "cards", f"{c['id']}.webp")
        thumb_path = os.path.join(ASSETS, "cards", "thumb", f"{c['id']}.webp")
        url = f"/assets/cards/{c['id']}.webp"
    else:
        ext = (os.path.splitext(f)[1] or ".png").lower()
        full_path = os.path.join(ASSETS, "cards", f"{c['id']}{ext}")
        thumb_path = None
        url = f"/assets/cards/{c['id']}{ext}"
    c["localizations"]["en"]["image"]["url"] = url
    if os.path.exists(full_path) and (thumb_path is None or os.path.exists(thumb_path)):
        return ("exists", c["id"], None)
    last_err = None
    for base in BASES:
        for attempt in range(2):
            try:
                req = urllib.request.Request(base + f, headers={"User-Agent": "revelio.cards/0.1"})
                raw = urllib.request.urlopen(req, timeout=30).read()
                if Image is not None:
                    im = Image.open(io.BytesIO(raw))
                    # keep transparency (cards have rounded/transparent corners);
                    # WebP q100 stores the alpha channel losslessly.
                    im = im.convert("RGBA" if ("A" in im.getbands() or im.mode in ("P", "LA")) else "RGB")
                    im.save(full_path, "WEBP", quality=WEBP_FULL_Q, method=WEBP_METHOD)
                    th = im.copy()
                    th.thumbnail((THUMB_W, THUMB_W * 2))
                    th.save(thumb_path, "WEBP", quality=WEBP_THUMB_Q, method=WEBP_METHOD)
                else:
                    with open(full_path, "wb") as fh:
                        fh.write(raw)
                return ("ok", c["id"], None)
            except urllib.error.HTTPError as e:
                last_err = e
                if e.code == 404:
                    break  # try next base folder
                time.sleep(1.0)
            except Exception as e:
                last_err = e
                time.sleep(1.0)
    return ("fail", c["id"], f"{f}: {last_err}")

def download_mode(cards, workers=WORKERS):
    """Download + convert all card images in parallel (I/O- and encode-bound)."""
    import warnings
    from concurrent.futures import ThreadPoolExecutor, as_completed
    warnings.filterwarnings("ignore")   # silence harmless Pillow palette/transparency notices
    overrides = load_overrides()
    try:
        from PIL import Image          # required for WebP conversion + thumbnails
    except ImportError:
        Image = None
        print("  (Pillow not found – saving source files as-is, no WebP/thumbnails. "
              "Install 'pillow' for WebP conversion.)")
    os.makedirs(os.path.join(ASSETS, "cards", "thumb"), exist_ok=True)
    print(f"  fetching {len(cards)} cards with {workers} parallel workers…")
    n = skipped = failed = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = [ex.submit(_process_one, c, overrides, Image) for c in cards]
        for fut in as_completed(futures):
            status, cid, err = fut.result()
            if status == "ok":
                n += 1
                if n % 100 == 0:
                    print(f"  …{n} converted")
            elif status == "exists":
                skipped += 1
            elif status == "fail":
                failed += 1
                print(f"  ! {cid} ({err})")
    print(f"  saved {n}, skipped {skipped} (existing), failed {failed} [workers={workers}]")
    return n

# Set symbols from the Revival site – all PNG (incl. HAH and QWF).
SYMBOL_BASE = "https://harrypottertcg.com/images/"
SYMBOL_FILES = {
    "BS": "logoBS.png", "QC": "logoQC.png", "DA": "logoDA.png", "AAH": "logoAAH.png",
    "COS": "logoCOS.png", "POA": "logoPOA.png", "HOS": "logoHOS.png", "SOH": "logoSOH.png",
    "EOTP": "eotp.png", "GOF": "logoGOF.png", "LM1": "logoLM1.png",
    "HAH": "hah.png", "QWF": "logoQWF.png",
}

def download_symbols():
    """Download set symbols and save as WebP lossless: assets/symbols/<code>.webp.

    Symbols are flat-colour logos with transparency, so lossless keeps edges crisp
    and the alpha intact. Falls back to the source PNG if Pillow isn't available.
    """
    import urllib.request, urllib.error, io
    try:
        from PIL import Image
    except ImportError:
        Image = None
    sets_path = os.path.join(DIST, "sets.json")
    sets = json.load(open(sets_path, encoding="utf-8"))
    out_dir = os.path.join(ASSETS, "symbols")
    os.makedirs(out_dir, exist_ok=True)
    n = failed = 0
    for code, s in sets.items():
        fname = SYMBOL_FILES.get(code)
        if not fname:
            continue
        try:
            req = urllib.request.Request(SYMBOL_BASE + fname, headers={"User-Agent": "revelio.cards/0.1"})
            raw = urllib.request.urlopen(req, timeout=30).read()
            if Image is not None:
                sym = Image.open(io.BytesIO(raw))
                sym = sym.convert("RGBA" if ("A" in sym.getbands() or sym.mode in ("P", "LA")) else "RGB")
                sym.save(os.path.join(out_dir, f"{code}.webp"), "WEBP", lossless=True, method=WEBP_METHOD)
                s["symbol"] = f"/assets/symbols/{code}.webp"
            else:
                ext = os.path.splitext(fname)[1].lower()
                with open(os.path.join(out_dir, f"{code}{ext}"), "wb") as fh:
                    fh.write(raw)
                s["symbol"] = f"/assets/symbols/{code}{ext}"
            n += 1
        except Exception as e:
            print(f"  ! symbol {code}: {e}")
            failed += 1
    json.dump(sets, open(sets_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"  symbols: saved {n}, failed {failed}")

def main():
    cards = json.load(open(os.path.join(DIST, "cards.json"), encoding="utf-8"))
    n = download_mode(cards) if DOWNLOAD else link_mode(cards)
    if DOWNLOAD:
        download_symbols()
    json.dump(cards, open(os.path.join(DIST, "cards.json"), "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    # refresh per-language slim files' image url (en image is the shared art)
    langs = sorted({l for c in cards for l in c["languages"]})
    for lang in langs:
        slim = json.load(open(os.path.join(DIST, f"cards.{lang}.json"), encoding="utf-8"))
        url_by_id = {c["id"]: c["localizations"]["en"]["image"].get("url") for c in cards}
        for s in slim:
            if not (s.get("image") or {}).get("url"):
                s.setdefault("image", {"file": None, "url": None})["url"] = url_by_id.get(s["id"])
        json.dump(slim, open(os.path.join(DIST, f"cards.{lang}.json"), "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    mode = "downloaded" if DOWNLOAD else "linked"
    print(f"{mode} {n} card images ({'local' if DOWNLOAD else BASE})")

if __name__ == "__main__":
    main()
