#!/usr/bin/env python3
"""
Transforms Tressley/hpjson (cards.json) into the revelio.cards schema.

Usage:
    git clone https://github.com/Tressley/hpjson.git
    python3 transform_hpjson.py hpjson/cards.json cards.json
"""
import json, re, sys, math

SET_CODES = {
    "Base": "BS", "Quidditch Cup": "QC", "Diagon Alley": "DA",
    "Adventures at Hogwarts": "AAH", "Chamber of Secrets": "COS",
    "Hogwarts A History": "HAH", "Echoes of the Past": "EOTP",
    "Lost Magic 1": "LM1", "Prisoner of Azkaban": "POA",
    "Heir of Slytherin": "HOS", "Streets of Hogsmeade": "SOH",
    "Goblet of Fire": "GOF", "Quidditch World Finals": "QWF",
    "Promotional": "PROMO",
}
# Original Wizards of the Coast sets (2001–2003)
OFFICIAL = {"Base", "Quidditch Cup", "Diagon Alley",
            "Adventures at Hogwarts", "Chamber of Secrets"}

def slug(s):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", (s or "").lower())).strip("-")

def as_list(v):
    if v is None: return []
    return v if isinstance(v, list) else [v]

def first(v):
    return v[0] if isinstance(v, list) and v else (None if isinstance(v, list) else v)

def to_int(v):
    try: return int(v)
    except (TypeError, ValueError): return None

def to_num(v):
    if isinstance(v, bool): return None
    if isinstance(v, (int, float)) and not (isinstance(v, float) and math.isnan(v)):
        return v
    return None

def clean_str(v):
    if v is None or (isinstance(v, float) and math.isnan(v)): return None
    return str(v)

def clean_rulings(rs):
    out = []
    for r in rs or []:
        if not isinstance(r, dict): continue
        e = {k: clean_str(r.get(k)) for k in ("date", "source", "ruling") if clean_str(r.get(k)) is not None}
        if e: out.append(e)
    return out

def join_text(v):
    parts = as_list(v)
    return "\n".join(p for p in parts if p) or None

def norm_provides(v):
    items = as_list(v)
    out = []
    for it in items:
        if isinstance(it, dict):
            out.append({"lesson": it.get("lesson"), "amount": to_int(it.get("amount"))})
    return out or None

def legality(v):
    if not v: return "unknown"
    v = v.lower()
    if v.startswith("restrict"): return "restricted"
    if v in ("legal", "banned"): return v
    return "unknown"

# Premium printings combine a base rarity with a finish. hpjson only records the
# combined label, so we split it: base rarity (best-effort) + finish.
RARITY_FINISH = {
    "Holo Portrait Premium": ("Rare", "holo"),   # the rare character portraits
    "Foil Premium": ("Rare", "foil"),            # foil chase cards (base rarity not in source -> Rare)
}

def split_rarity(raw):
    if raw in RARITY_FINISH:
        return RARITY_FINISH[raw]
    return raw, "normal"

def transform(c, lang="en"):
    name, setName, number = c.get("name"), c.get("setName"), str(c.get("number", ""))
    types = as_list(c.get("type"))
    rarity, finish = split_rarity(c.get("rarity"))

    # Language-specific printed face
    loc = {
        "name": name,
        "status": "official",
        "source": "WotC (hpjson)",
        "text": join_text(c.get("effect")),
        "flavorText": c.get("flavorText"),
        "adventure": None,
        "match": None,
        "image": {"file": c.get("imgSrc"), "url": None},
    }
    # De-duplicate: structured adventure/match is canonical, so 'text' is null for them.
    if "Adventure" in types:
        loc["text"] = None
        loc["adventure"] = {"effect": join_text(c.get("effect")),
                            "toSolve": c.get("toSolve"), "reward": c.get("reward")}
    if "Match" in types:
        loc["text"] = None
        loc["match"] = {"toWin": c.get("toWin"), "prize": c.get("prize")}

    out = {
        "id": "-".join(filter(None, [slug(SET_CODES.get(setName, setName)), number, slug(name)])),
        "name": name,
        "setCode": SET_CODES.get(setName, slug(setName).upper()),
        "number": number,
        "types": types,
        "subTypes": as_list(c.get("subTypes")),
        "lesson": first(c.get("lesson")),
        "cost": to_int(c.get("cost")),
        "provides": norm_provides(c.get("provides")),
        "rarity": rarity,
        "finish": finish,
        "artist": [a for a in (clean_str(x) for x in as_list(c.get("artist"))) if a and a != "NaN"],
        "stats": None,
        "orientation": "horizontal" if c.get("horizontal") else "vertical",
        "legality": legality(c.get("Legality")),
        "draftValue": to_num(c.get("draftValue")),
        "rulings": clean_rulings(c.get("rulings")),
        "defaultLanguage": lang,
        "languages": [lang],
        "localizations": {lang: loc},
    }
    if "Creature" in types and (c.get("health") or c.get("dmgEachTurn")):
        out["stats"] = {"health": to_int(c.get("health")),
                        "damagePerTurn": to_int(c.get("dmgEachTurn"))}
    return out

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "hpjson/cards.json"
    dst = sys.argv[2] if len(sys.argv) > 2 else "cards.json"
    cards = json.load(open(src, encoding="utf-8"))
    out = [transform(c) for c in cards]
    seen = {}
    for c in out:
        if c["id"] in seen:
            seen[c["id"]] += 1
            c["id"] = f"{c['id']}-{seen[c['id']]}"
        else:
            seen[c["id"]] = 1
    json.dump(out, open(dst, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"{len(out)} cards -> {dst}")

if __name__ == "__main__":
    main()
