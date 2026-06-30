#!/usr/bin/env python3
"""
Card images via accio.cards. Our localizations.en.image.file IS the accio filename
(both come from hpjson), so the URL is just BASE + file — no Drive, no name matching.

Two modes:
  --link   (default here)  set image.url to the remote accio URL (hotlink). Instant,
                           covers every set incl. Chamber of Secrets. No download.
  --download               download each image and save it LOCALLY as
                           assets/cards/<id>.<ext> (+ thumb), then set image.url to the
                           local path. Run this on your machine to self-host.

Usage:
  python3 accio_images.py            # link mode (rewrites dist/cards.json + per-lang)
  python3 accio_images.py --download # self-host (needs network + Pillow)

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
FULL_W, THUMB_W = 745, 244

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

def download_mode(cards):
    import urllib.request, urllib.error, io, time, warnings
    warnings.filterwarnings("ignore")   # silence harmless Pillow palette/transparency notices
    overrides = load_overrides()
    try:
        from PIL import Image          # optional: only needed for thumbnails
    except ImportError:
        Image = None
        print("  (Pillow not found – saving full images only, no thumbnails. "
              "Install 'pillow' if you want thumbs.)")
    os.makedirs(os.path.join(ASSETS, "cards", "thumb"), exist_ok=True)
    n = skipped = failed = 0
    for c in cards:
        f = overrides.get(c["id"]) or c["localizations"]["en"]["image"].get("file")
        if not f:
            continue
        ext = (os.path.splitext(f)[1] or ".png").lower()
        full_path = os.path.join(ASSETS, "cards", f"{c['id']}{ext}")
        thumb_path = os.path.join(ASSETS, "cards", "thumb", f"{c['id']}.jpg")
        c["localizations"]["en"]["image"]["url"] = f"/assets/cards/{c['id']}{ext}"
        if os.path.exists(full_path) and (Image is None or os.path.exists(thumb_path)):
            skipped += 1
            continue
        ok = False
        last_err = None
        for base in BASES:
            for attempt in range(2):
                try:
                    req = urllib.request.Request(base + f, headers={"User-Agent": "revelio.cards/0.1"})
                    raw = urllib.request.urlopen(req, timeout=30).read()
                    with open(full_path, "wb") as fh:
                        fh.write(raw)
                    if Image is not None:
                        th = Image.open(io.BytesIO(raw)).convert("RGB")
                        th.thumbnail((THUMB_W, THUMB_W * 2))
                        th.save(thumb_path, "JPEG", quality=85)
                    ok = True
                    break
                except urllib.error.HTTPError as e:
                    last_err = e
                    if e.code == 404:
                        break  # try next base folder
                    time.sleep(1.5)
                except Exception as e:
                    last_err = e
                    time.sleep(1.5)
            if ok:
                break
        if not ok:
            print(f"  ! {c['id']} ({f}): {last_err}")
        if ok:
            n += 1
            if n % 100 == 0:
                print(f"  …{n} downloaded")
            time.sleep(0.1)  # be polite
        else:
            failed += 1
    print(f"  downloaded {n}, skipped {skipped} (existing), failed {failed}")
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
    """Download set symbols into assets/symbols/<code>.png (all PNG)."""
    import urllib.request, urllib.error
    sets_path = os.path.join(DIST, "sets.json")
    sets = json.load(open(sets_path, encoding="utf-8"))
    out_dir = os.path.join(ASSETS, "symbols")
    os.makedirs(out_dir, exist_ok=True)
    n = failed = 0
    for code, s in sets.items():
        fname = SYMBOL_FILES.get(code)
        if not fname:
            continue
        ext = os.path.splitext(fname)[1].lower()
        dest = os.path.join(out_dir, f"{code}{ext}")
        try:
            req = urllib.request.Request(SYMBOL_BASE + fname, headers={"User-Agent": "revelio.cards/0.1"})
            with open(dest, "wb") as fh:
                fh.write(urllib.request.urlopen(req, timeout=30).read())
            s["symbol"] = f"/assets/symbols/{code}{ext}"
            n += 1
        except Exception as e:
            print(f"  ! symbol {code}: {e}")
            failed += 1
    json.dump(sets, open(sets_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"  symbols: downloaded {n}, failed {failed}")

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
