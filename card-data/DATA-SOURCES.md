# revelio.cards – Card Data & Images: Research

## TL;DR

For **card data (text/stats)** there is an almost ready-made, freely usable source:
the JSON repo **hpjson** – exactly the data behind accio.cards. For **images** there
are good community sources (HD recreations, scans), but **this is where the legal risk
sits**, because the card images belong to Warner Bros. / Wizards of the Coast.

---

## 1. Card data (text, stats, rules)

**Recommendation: `Tressley/hpjson` (GitHub).**
- Complete card data as JSON, maintained by the Revival community, with its "About"
  pointing directly at accio.cards – effectively the data behind accio.
- Fields per card: `number`, `name`, `lesson`, `type`, `subTypes`, `cost`,
  `description`, `flavorText`, `dmgEachTurn`, `health`, `rarity`, `artist`, plus
  `imgSrc`, `rulings`, `releaseDate`, `Legality`, `draftValue`.
- Split by set (folder `sets/`) + a combined `cards.json`.
- URL: https://github.com/Tressley/hpjson

Additional data/list sources (for cross-checking/filling gaps):
- Full card list (Google Sheet) by the Revival community (promos + all sets).
- nslists.com/hptcg1.htm – Base Set list (no., name, type, rarity, artist).
- tcdb.com – checklists & galleries (2001 Wizards Harry Potter TCG).
- Pojo.com – official WotC rulings/FAQ.

Legally: pure **facts** (stats, numbers, artist) are barely protectable; the printed
**rules text/flavor text** may be copyright-relevant, but is a much smaller risk than
images.

---

## 2. Card images (the tricky part)

Sources that exist:
- **harrypottertcg.com → Resources:** per-set Google Drive folders with "High
  Definition Cards" and "Print Ready Files" (Base Set, Quidditch Cup, Diagon Alley,
  Adventures at Hogwarts, Chamber of Secrets + fan sets). Mostly community HD
  recreations/scans.
- **accio.cards** hosts card images itself.
- **tcdb.com**, **CCG Trader** – galleries with scans.
- **Steam Workshop / BGG (HQ Card Scans)** – collected scans for Tabletop
  Simulator/Lackey.

**Legal status:** all of these show WB/WotC artwork → copyright belongs to **Warner
Bros.** (trademark "Harry Potter") and the illustrators/WotC. Even community "HD
recreations" are derivative works and don't change this. accio.cards itself runs as an
**unofficial fan project** with a disclaimer – a tolerated gray area, not "licensed."

Consequence for revelio.cards: using images means taking on the same fan risk as
accio. In practice that means:
- a clear "unofficial fan project / not affiliated with Warner Bros." disclaimer,
- staying non-commercial (no sales, no ads on the images),
- being ready to take images down on request (takedown readiness),
- possibly serving images only at moderate resolution.

---

## 3. Recommended path

1. **Data:** adopt hpjson as the base (fork), transform into our schema.
   Cross-check with nslists/tcdb, fill gaps. *(done – see `data/`)*
2. **Images:** work within the same fan framework as accio – the Revival community's
   HD files as source, with disclaimer + takedown policy, non-commercial.
3. **Clean image-risk-free start (option):** launch with data + our own
   placeholders/set symbols first, add images deliberately later.
4. **Before any commercial plans:** brief legal review (WB IP).

---

## Sources

- hpjson (data): https://github.com/Tressley/hpjson
- Revival resources (images/HD files): https://harrypottertcg.com/ResourcesPage.html
- accio.cards: https://accio.cards
- Base Set list: https://www.nslists.com/hptcg1.htm
- TCDB: https://www.tcdb.com/ViewSet.cfm/sid/91182/2001-Wizards-Harry-Potter-TCG
- Pojo rulings: https://www.pojo.com/harrypotter/ccg/rulings.shtml
- Recreation engine (reference): https://github.com/StefanoFiumara/harry-potter-tcg
