import {
  pgTable, text, integer, boolean, jsonb, timestamp, primaryKey, index,
} from 'drizzle-orm/pg-core'

const editable = {
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  origin: text('origin').notNull().default('import'),
}

// --- reference (vocabulary) tables ---
export const types = pgTable('types', {
  code: text('code').primaryKey(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...editable,
})

export const subTypes = pgTable('sub_types', {
  code: text('code').primaryKey(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...editable,
})

export const lessons = pgTable('lessons', {
  code: text('code').primaryKey(),
  color: text('color'),
  sortOrder: integer('sort_order').notNull().default(0),
  ...editable,
})

export const rarities = pgTable('rarities', {
  code: text('code').primaryKey(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...editable,
})

export const finishes = pgTable('finishes', {
  code: text('code').primaryKey(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...editable,
})

export const legalities = pgTable('legalities', {
  code: text('code').primaryKey(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...editable,
})

// --- core tables ---
export const sets = pgTable('sets', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  releaseDate: text('release_date'),
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
  draftValue: integer('draft_value'),
  rulings: jsonb('rulings'),
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
