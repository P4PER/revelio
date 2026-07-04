import type { CardDetailDTO, CardLocalizationDTO } from '@revelio/core'

// Best available localization for the locale: requested → defaultLanguage → any.
// `loc` is undefined only when the card has no localization rows at all; callers
// guard with notFound()/{} in that case.
export function pickLocalization(
  card: CardDetailDTO,
  locale: string,
): { loc: CardLocalizationDTO | undefined; isFallback: boolean } {
  const requested = card.localizations[locale]
  // A row that exists only to hold an image (e.g. an image was uploaded before
  // the text was translated) has an empty name — treat it as no localization so
  // the name/text fall back to the default language (the image resolves separately).
  if (requested && requested.name.trim()) return { loc: requested, isFallback: false }
  const fallback =
    card.localizations[card.defaultLanguage] ?? Object.values(card.localizations)[0]
  return { loc: fallback, isFallback: true }
}
