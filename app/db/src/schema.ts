import {
  pgTable, text, integer, real, boolean, jsonb, timestamp, primaryKey, index,
  date,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { user } from './auth-schema'

const editable = {
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  origin: text('origin').notNull().default('import'),
}

// --- reference (vocabulary) tables ---
// Codes are FK anchors for cards. Labels live in the next-intl message catalog
// (app/web/messages/*.json), never here. sort_order is only kept where the
// vocabulary has an inherent rank (rarities); types/lessons are
// unordered sets whose display order lives in app/core/src/attributes.ts.
// (Finishes have no table: cards.finishes is a text[] that can't carry an
// element FK, and finish order lives in app/core/src/attributes.ts.)
export const types = pgTable('types', {
  code: text('code').primaryKey(),
})

export const subTypes = pgTable('sub_types', {
  code: text('code').primaryKey(),
})

export const lessons = pgTable('lessons', {
  code: text('code').primaryKey(),
})

export const rarities = pgTable('rarities', {
  code: text('code').primaryKey(),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const legalities = pgTable('legalities', {
  code: text('code').primaryKey(),
})

export const subTypeLocalizations = pgTable('sub_type_localizations', {
  subTypeCode: text('sub_type_code').notNull().references(() => subTypes.code, { onDelete: 'cascade' }),
  lang: text('lang').notNull(),
  label: text('label').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.subTypeCode, t.lang] }),
}))

// --- core tables ---
export const sets = pgTable('sets', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  releaseDate: date('release_date'),
  isOfficial: boolean('is_official').notNull().default(false),
  cardCount: integer('card_count').notNull().default(0),
  symbolVersion: integer('symbol_version'),
  ...editable,
})

export const setLocalizations = pgTable('set_localizations', {
  setCode: text('set_code').notNull().references(() => sets.code, { onDelete: 'cascade' }),
  lang: text('lang').notNull(),
  name: text('name').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.setCode, t.lang] }),
}))

export const cards = pgTable('cards', {
  id: text('id').primaryKey(),
  setCode: text('set_code').notNull().references(() => sets.code),
  number: text('number').notNull(),
  name: text('name').notNull(),
  lesson: text('lesson').references(() => lessons.code),
  cost: integer('cost'),
  provides: jsonb('provides'),
  rarity: text('rarity').references(() => rarities.code),
  finishes: text('finishes').array().notNull().default(['normal']),
  artist: text('artist').array().notNull().default([]),
  health: integer('health'),
  damagePerTurn: integer('damage_per_turn'),
  orientation: text('orientation'),
  artCropVersion: integer('art_crop_version'),
  legality: text('legality').references(() => legalities.code),
  draftValue: real('draft_value'),
  defaultLanguage: text('default_language').notNull(),
  languages: text('languages').array().notNull().default([]),
  ...editable,
}, (t) => ({
  setCodeIdx: index('cards_set_code_idx').on(t.setCode),
}))

// --- junction tables for the array-valued vocabularies ---
export const cardTypes = pgTable('card_types', {
  cardId: text('card_id').notNull().references(() => cards.id),
  typeCode: text('type_code').notNull().references(() => types.code),
}, (t) => ({
  pk: primaryKey({ columns: [t.cardId, t.typeCode] }),
}))

export const cardSubTypes = pgTable('card_sub_types', {
  cardId: text('card_id').notNull().references(() => cards.id),
  subTypeCode: text('sub_type_code').notNull().references(() => subTypes.code),
}, (t) => ({
  pk: primaryKey({ columns: [t.cardId, t.subTypeCode] }),
}))

export const cardRulings = pgTable('card_rulings', {
  id: text('id').primaryKey(),
  cardId: text('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  date: text('date'),
  source: text('source'),
  ...editable,
}, (t) => ({
  byCard: index('card_rulings_card_id_idx').on(t.cardId),
}))

export const cardRulingLocalizations = pgTable('card_ruling_localizations', {
  rulingId: text('ruling_id').notNull().references(() => cardRulings.id, { onDelete: 'cascade' }),
  lang: text('lang').notNull(),
  text: text('text').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.rulingId, t.lang] }),
}))

export const cardLocalizations = pgTable('card_localizations', {
  cardId: text('card_id').notNull().references(() => cards.id),
  lang: text('lang').notNull(),
  name: text('name').notNull(),
  status: text('status'),
  source: text('source'),
  text: text('text'),
  flavorText: text('flavor_text'),
  adventure: jsonb('adventure'),
  match: jsonb('match'),
  imageVersion: integer('image_version'),
  ...editable,
}, (t) => ({
  pk: primaryKey({ columns: [t.cardId, t.lang] }),
}))

export const decks = pgTable('decks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  format: text('format').notNull(),
  visibility: text('visibility').notNull().default('private'),
  likeCount: integer('like_count').notNull().default(0),
  viewCount: integer('view_count').notNull().default(0),
  lessons: text('lessons').array().notNull().default(sql`'{}'::text[]`),
  ...editable,
}, (t) => ({
  byUser: index('decks_user_id_idx').on(t.userId),
  byVisibility: index('decks_visibility_idx').on(t.visibility),
  byLikeCount: index('decks_like_count_idx').on(t.likeCount),
  byViewCount: index('decks_view_count_idx').on(t.viewCount),
  byLessons: index('decks_lessons_gin_idx').using('gin', t.lessons),
}))

export const deckCards = pgTable('deck_cards', {
  deckId: text('deck_id').notNull().references(() => decks.id, { onDelete: 'cascade' }),
  cardId: text('card_id').notNull().references(() => cards.id),
  zone: text('zone').notNull(),
  quantity: integer('quantity').notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.deckId, t.cardId, t.zone] }) }))

export const deckLikes = pgTable('deck_likes', {
  deckId: text('deck_id').notNull().references(() => decks.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.deckId, t.userId] }),
  byUser: index('deck_likes_user_id_idx').on(t.userId),
}))

export const deckViews = pgTable('deck_views', {
  deckId: text('deck_id').notNull().references(() => decks.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.deckId, t.userId] }),
}))

// --- collections: one implicit collection per user, plus owned copies ---

// One row per user, created lazily on first write. Holds only the share flag;
// absence of a row == empty, private collection.
export const collections = pgTable('collections', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  visibility: text('visibility').notNull().default('private'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// Owned copies, keyed per (user, card, finish). Rows exist only for quantity >= 1;
// decrementing to zero deletes the row. `finish` is validated in the write path
// (no finishes vocab table exists to FK against).
export const userCards = pgTable('user_cards', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  cardId: text('card_id').notNull().references(() => cards.id),
  finish: text('finish').notNull(),
  quantity: integer('quantity').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.cardId, t.finish] }),
  byUser: index('user_cards_user_id_idx').on(t.userId),
  byUserCard: index('user_cards_user_card_idx').on(t.userId, t.cardId),
}))

// Better Auth tables (generated via @better-auth/cli).
export * from './auth-schema'
