#!/usr/bin/env python3
"""
Single build entry point for revelio.cards data.

Inputs (editable, in git):
  - hpjson clone (English source)        -> argument, default ./hpjson
  - translations/<lang>.json overlays
Outputs (generated, in dist/, git-ignored):
  - dist/cards.json              full bundle, all languages
  - dist/sets.json               set metadata keyed by setCode
  - dist/cards.<lang>.json       slim, denormalized per language (with fallback)
  - dist/search-index.<lang>.json   folded name/text/flavor for fast search

Usage:
  python3 build_dataset.py [path/to/hpjson]

If the hpjson path doesn't exist, it is cloned automatically from GitHub.
"""
import json, os, sys, glob, re, unicodedata, subprocess, shutil
from collections import defaultdict
from transform_hpjson import transform, SET_CODES, OFFICIAL, slug

HERE = os.path.dirname(os.path.abspath(__file__))
_OV_PATH = os.path.join(HERE, "card_overrides.json")
CARD_OVERRIDES = json.load(open(_OV_PATH, encoding="utf-8")) if os.path.exists(_OV_PATH) else {}
DIST = os.path.join(HERE, "dist")
HPJSON_REPO = "https://github.com/Tressley/hpjson.git"
TRANSLATIONS = os.path.join(HERE, "translations")

# Set symbols (Revival community art); names/dates are derived from the source data.
SYMBOLS = {c: f"https://harrypottertcg.com/images/{f}" for c, f in {
    "BS": "logoBS.png", "QC": "logoQC.png", "DA": "logoDA.png", "AAH": "logoAAH.png",
    "COS": "logoCOS.png", "HAH": "hah.png", "EOTP": "eotp.png", "SOH": "logoSOH.png",
    "POA": "logoPOA.png", "HOS": "logoHOS.png", "GOF": "logoGOF.png", "QWF": "logoQWF.png",
    "LM1": "logoLM1.png",
}.items()}
OFFICIAL_CODES = {SET_CODES[n] for n in OFFICIAL}

def fold(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return s.lower().strip()

def drop_premium_duplicates(cards):
    """Drop a premium-sourced row when a normal-sourced row shares its (setCode, number):
    the premium is now expressed via the surviving row's derived finishes[]. Premium-only
    rows (no normal sibling) are kept as ordinary cards."""
    groups = defaultdict(list)
    for c in cards:
        groups[(c["setCode"], c["number"])].append(c)
    kept = []
    for c in cards:
        siblings = groups[(c["setCode"], c["number"])]
        has_normal = any(not s.get("_premiumSource") for s in siblings)
        if c.get("_premiumSource") and has_normal:
            continue  # redundant premium duplicate
        kept.append(c)
    return kept

def apply_card_overrides(cards):
    """Curated fixes keyed by the built card id: drop a misspelled duplicate, or
    override a wrong collector number (re-deriving the id from the new number)."""
    kept = []
    for c in cards:
        ov = CARD_OVERRIDES.get(c["id"])
        if ov:
            if ov.get("drop"):
                continue
            if "number" in ov:
                c["number"] = str(ov["number"])
                c["id"] = "-".join(filter(None, [slug(c["setCode"]), c["number"], slug(c["name"])]))
        kept.append(c)
    return kept

def build_cards(hp_cards):
    cards = drop_premium_duplicates([transform(c) for c in hp_cards])
    for c in cards:
        c.pop("_premiumSource", None)  # transient; never written to dist
    seen = {}
    for c in cards:
        if c["id"] in seen:
            seen[c["id"]] += 1
            c["id"] = f"{c['id']}-{seen[c['id']]}"
        else:
            seen[c["id"]] = 1
    return apply_card_overrides(cards)

def merge_overlays(cards):
    by_id = {c["id"]: c for c in cards}
    for path in sorted(glob.glob(os.path.join(TRANSLATIONS, "*.json"))):
        lang = os.path.splitext(os.path.basename(path))[0]
        overlay = json.load(open(path, encoding="utf-8"))
        for cid, f in overlay.items():
            card = by_id.get(cid)
            if not card:
                print(f"  ! unknown id in {lang}.json: {cid}")
                continue
            adventure, match = f.get("adventure"), f.get("match")
            card["localizations"][lang] = {
                "name": f.get("name") or card["name"],
                "status": f.get("status", "unknown"),
                "source": f.get("source"),
                # De-dup: structured adventure/match is canonical, so text is null for them.
                "text": None if (adventure or match) else f.get("text"),
                "flavorText": f.get("flavorText"),
                "adventure": adventure,
                "match": match,
                "image": f.get("image", {"file": None, "url": None}),
            }
            if lang not in card["languages"]:
                card["languages"].append(lang)
    return cards

def build_sets(hp_cards, cards):
    sets = {}
    counts = {}
    for c in cards:
        counts[c["setCode"]] = counts.get(c["setCode"], 0) + 1
    for raw in hp_cards:
        name = raw.get("setName")
        code = SET_CODES.get(name, re.sub(r"[^A-Z0-9]", "", (name or "").upper()))
        if code not in sets:
            sets[code] = {
                "code": code,
                "name": name,
                "releaseDate": raw.get("releaseDate"),
                "isOfficial": code in OFFICIAL_CODES,
                "cardCount": counts.get(code, 0),
                "symbol": SYMBOLS.get(code),
            }
    return dict(sorted(sets.items()))

def slim(card, lang):
    locs = card["localizations"]
    used = lang if lang in locs else card["defaultLanguage"]
    loc = locs[used]
    return {
        "id": card["id"], "setCode": card["setCode"], "number": card["number"],
        "types": card["types"], "subTypes": card["subTypes"], "lesson": card["lesson"],
        "cost": card["cost"], "provides": card["provides"], "rarity": card["rarity"], "finishes": card["finishes"],
        "artist": card["artist"], "stats": card["stats"], "orientation": card["orientation"],
        "legality": card["legality"], "draftValue": card["draftValue"], "rulings": card["rulings"],
        "lang": used, "translationStatus": loc["status"],
        "name": loc["name"], "text": loc["text"], "flavorText": loc["flavorText"],
        "adventure": loc.get("adventure"), "match": loc.get("match"), "image": loc.get("image"),
    }

def search_index(cards, lang):
    out = []
    for c in cards:
        loc = c["localizations"].get(lang) or c["localizations"][c["defaultLanguage"]]
        out.append({
            "id": c["id"], "setCode": c["setCode"], "types": c["types"],
            "lesson": c["lesson"], "rarity": c["rarity"], "cost": c["cost"],
            "name": loc["name"],
            "name_f": fold(loc["name"]),
            "text_f": fold(loc.get("text")),
            "flavor_f": fold(loc.get("flavorText")),
        })
    return out

def assert_unique_numbers(cards):
    by_key = {}
    for c in cards:
        by_key.setdefault((c["setCode"], c["number"]), []).append(c["id"])
    dups = {k: v for k, v in by_key.items() if len(v) > 1}
    if dups:
        lines = "\n".join(f"  {sc} #{n}: {ids}" for (sc, n), ids in sorted(dups.items()))
        sys.exit(f"duplicate (setCode, number) after overrides:\n{lines}")
    ids = [c["id"] for c in cards]
    if len(ids) != len(set(ids)):
        sys.exit("duplicate card ids after overrides")

def validate(cards, sets):
    try:
        import jsonschema
    except ImportError:
        print("  (jsonschema not installed – skipping validation)")
        return
    cs = json.load(open(os.path.join(HERE, "card.schema.json")))
    ss = json.load(open(os.path.join(HERE, "sets.schema.json")))
    cerr = sum(1 for c in cards for _ in jsonschema.Draft7Validator(cs).iter_errors(c))
    serr = sum(1 for _ in jsonschema.Draft7Validator(ss).iter_errors(sets))
    print(f"  validation: card errors={cerr}, set errors={serr}")

def write(path, data):
    json.dump(data, open(path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)

def ensure_hpjson(hp_path):
    """Clone the hpjson English source if it isn't present yet.

    Returns True if this run created the clone (so the caller may remove it),
    False if the source already existed (never touch a user-provided checkout).
    """
    cards_file = os.path.join(hp_path, "cards.json")
    if os.path.exists(cards_file):
        return False
    print(f"hpjson not found at {hp_path} – cloning {HPJSON_REPO} ...")
    subprocess.run(["git", "clone", "--depth", "1", HPJSON_REPO, hp_path], check=True)
    if not os.path.exists(cards_file):
        sys.exit(f"clone finished but {cards_file} is missing")
    return True

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    flags = {a for a in sys.argv[1:] if a.startswith("-")}
    keep = "--keep-hpjson" in flags

    # Default to a clone next to this script so it works from any cwd.
    hp_path = args[0] if args else os.path.join(HERE, "hpjson")
    cloned = ensure_hpjson(hp_path)
    hp_cards = json.load(open(os.path.join(hp_path, "cards.json"), encoding="utf-8"))
    os.makedirs(DIST, exist_ok=True)

    cards = merge_overlays(build_cards(hp_cards))
    assert_unique_numbers(cards)
    sets = build_sets(hp_cards, cards)
    langs = sorted({l for c in cards for l in c["languages"]})

    write(os.path.join(DIST, "cards.json"), cards)
    write(os.path.join(DIST, "sets.json"), sets)
    for lang in langs:
        write(os.path.join(DIST, f"cards.{lang}.json"), [slim(c, lang) for c in cards])
        write(os.path.join(DIST, f"search-index.{lang}.json"), search_index(cards, lang))

    print(f"cards: {len(cards)} | sets: {len(sets)} | languages: {langs}")
    validate(cards, sets)
    print(f"-> {DIST}")

    # Only remove the clone we created ourselves; never a user-supplied checkout.
    if cloned and not keep:
        shutil.rmtree(hp_path, ignore_errors=True)
        print(f"removed temporary clone: {hp_path}  (use --keep-hpjson to keep it)")

if __name__ == "__main__":
    main()
