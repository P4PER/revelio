export function imageKey(id: string, lang?: string, defaultLang?: string): string {
  return lang && defaultLang && lang !== defaultLang ? `cards/${id}.${lang}.webp` : `cards/${id}.webp`
}

export function thumbKey(id: string, lang?: string, defaultLang?: string): string {
  return lang && defaultLang && lang !== defaultLang
    ? `cards/thumb/${id}.${lang}.webp`
    : `cards/thumb/${id}.webp`
}

// Deck-hero art crop: a pre-cropped, upright character image baked at ingest time.
// Default-language only (no lang suffix) — the deck hero always shows the en art.
export function artCropKey(id: string): string {
  return `cards/art-crop/${id}.webp`
}

export function symbolKey(code: string): string {
  return `symbols/${code}.webp`
}

export function imageUrl(base: string, key: string): string {
  return `${base.replace(/\/$/, '')}/${key}`
}

// Which language's image to show for `lang`: its own if present, else the
// default language's, else none.
export function effectiveImageLang(
  hasImage: (lang: string) => boolean,
  lang: string,
  defaultLang: string,
): string | null {
  if (hasImage(lang)) return lang
  if (hasImage(defaultLang)) return defaultLang
  return null
}
