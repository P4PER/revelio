import type { CardDetailDTO, CardLocalizationDTO } from '@revelio/core'

export function pickLocalization(
  card: CardDetailDTO, locale: string,
): { loc: CardLocalizationDTO; isFallback: boolean } {
  const requested = card.localizations[locale]
  if (requested) return { loc: requested, isFallback: false }
  return { loc: card.localizations[card.defaultLanguage], isFallback: true }
}
