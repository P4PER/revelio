import {
  pgTable, text, integer, real, boolean, jsonb, timestamp, primaryKey, index,
  date,
} from 'drizzle-orm/pg-core'

const editable = {
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  origin: text('origin').notNull().default('import'),
}

// --- reference (vocabulary) tables ---
// Codes are FK anchors for cards. Labels live in the next-intl message catalog
// (app/web/messages/*.json), never here. sort_order is only kept where the
// vocabulary has an inherent rank (rarities, finishes); types/lessons are
// unordered sets whose display order lives in app/core/src/attributes.ts.
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

export const finishes = pgTable('finishes', {
  code: text('code').primaryKey(),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const legalities = pgTable('legalities', {
  code: text('code').primaryKey(),
})

export const subTypeTranslations = pgTable('sub_type_translations', {
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
  symbol: text('symbol'),
  ...editable,
})

export const cards = pgTable('cards', {
  id: text('id').primaryKey(),
  setCode: text('set_code').notNull().references(() => sets.code),
  number: text('number').notNull(),
  name: text('name').notNull(),
  lesson: text('lesson').references(() => lessons.code),
  cost: integer('cost'),
  provides: jsonb('provides'),
  rarity: text('rarity').references(() => rarities.code),
  finish: text('finish').references(() => finishes.code),
  artist: text('artist').array().notNull().default([]),
  health: integer('health'),
  damagePerTurn: integer('damage_per_turn'),
  orientation: text('orientation'),
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

export const cardRulingTexts = pgTable('card_ruling_texts', {
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
  imageFile: text('image_file'),
  imageUrl: text('image_url'),
  ...editable,
}, (t) => ({
  pk: primaryKey({ columns: [t.cardId, t.lang] }),
}))

// Better Auth tables (generated via @better-auth/cli).
export * from './auth-schema'
