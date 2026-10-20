import type { DB } from '../client'
import { upsertLocalization, type LocalizationInput } from './localizations'
import { saveRulings, type RulingInput } from './rulings'

export type CardEditInput = {
  localization: LocalizationInput
  rulings: RulingInput[]
}

// The edit page saves a card's text and its rulings on one click, so they commit
// together: a rulings failure must not leave the new text written on its own.
export async function saveCardEdit(db: DB, input: CardEditInput): Promise<void> {
  const { cardId, lang } = input.localization
  await db.transaction(async (tx) => {
    await upsertLocalization(tx, input.localization)
    await saveRulings(tx, cardId, lang, input.rulings)
  })
}
