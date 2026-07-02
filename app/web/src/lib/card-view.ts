import type { CardDetailDTO, CardLocalizationDTO } from '@revelio/core'

// Best available localization for the locale: requested → defaultLanguage → any.
// `loc` is undefined only when the card has no localization rows at all; callers
// guard with notFound()/{} in that case.
export function pickLocalization(
  card: CardDetailDTO,
  locale: string,
): { loc: CardLocalizationDTO | undefined; isFallback: boolean } {
  const requested = card.localizations[locale]
  if (requested) return { loc: requested, isFallback: false }
  const fallback =
    card.localizations[card.defaultLanguage] ?? Object.values(card.localizations)[0]
  return { loc: fallback, isFallback: true }
}
