import {
  pgTable, text, integer, boolean, jsonb, timestamp, primaryKey, index,
} from 'drizzle-orm/pg-core'

// Editability metadata shared by every table: pipeline rows are origin='import',
// future in-app creates will be origin='user'.
const editable = {
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  origin: text('origin').notNull().default('import'),
}

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
  types: text('types').array().notNull().default([]),
  subTypes: text('sub_types').array().notNull().default([]),
  lesson: text('lesson'),
  cost: integer('cost'),
  provides: jsonb('provides'),
  rarity: text('rarity'),
  finish: text('finish'),
  artist: text('artist').array().notNull().default([]),
  health: integer('health'),
  damagePerTurn: integer('damage_per_turn'),
  orientation: text('orientation'),
  legality: text('legality'),
  draftValue: integer('draft_value'),
  rulings: jsonb('rulings'),
  defaultLanguage: text('default_language').notNull(),
  languages: text('languages').array().notNull().default([]),
  ...editable,
}, (t) => ({
  setCodeIdx: index('cards_set_code_idx').on(t.setCode),
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
