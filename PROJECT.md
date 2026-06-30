# revelio.cards – Project Summary

## Vision

A searchable card database for the **Harry Potter Trading Card Game (2001, Wizards of
the Coast)** – in the style of [Scryfall](https://scryfall.com) (for Magic), as the
HP counterpart to [accio.cards](https://accio.cards). Goal: players, collectors and
nostalgic fans can quickly find any card with all its details.

## What it's about

The name **revelio.cards** plays on the revealing charm *Revelio* – fitting for a site
that "reveals" cards and makes them searchable.

## Core features (planned)

- **Full-text search** across all cards (name, text, type).
- **Filters & advanced search**: set/expansion, card type (Spell, Creature, Lesson,
  Item, Adventure, Location, Event, Match, Character), rarity, cost, attributes.
- **Detail view** per card: high-resolution image, rules text, set, rarity,
  collector number, illustrator.
- **Set/expansion overview** (Base Set, Quidditch Cup, Diagon Alley, Adventures at
  Hogwarts, Chamber of Secrets).
- Optional later: collection/wishlists, deck builder, multi-language, price/market hints.

## Data

- Card data (name, text, set, type, rarity, number, illustrator) + card images.
- Data foundation: the `Tressley/hpjson` project (see `DATA-SOURCES.md`), already
  transformed into our schema in `card-data/`.

## Tech (direction open)

- A fast, search-centric web app; search is the core (e.g. a search index / filter API).
- Frontend uses the house font **Poppins** and the Reveal-Glow color scheme (see
  `logos/BRAND-GUIDE.md`).

## Branding

The logo set and color/font guide live in the **`logos/`** folder
(`BRAND-GUIDE.md`). Concept: gold (the revealing light) on indigo/midnight, with a
wand-and-spark mark.

## Legal note

Harry Potter and the card artwork/trademark belong to **Warner Bros.** (TCG: Wizards
of the Coast). revelio.cards is intended as an **unofficial fan/database project**.
The main risk is copyright/trademark (mainly the card images), not the domain name.
Recommendation: a clear "unofficial fan project" disclaimer, no official WB branding,
and, for any commercial plans, legal advice beforehand.

## Possible next steps

1. Confirm data source & scope (which sets, images yes/no). *(done – see `card-data/`)*
2. Define a data model/schema for a card. *(done – see `card-data/card.schema.json`)*
3. Choose a tech stack and build a search prototype.
4. Integrate branding (logo, favicon, colors, Poppins).
