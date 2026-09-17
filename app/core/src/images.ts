function langSuffix(lang?: string, defaultLang?: string): string {
  return lang && defaultLang && lang !== defaultLang ? `.${lang}` : ''
}

export function imageKey(id: string, version: number, lang?: string, defaultLang?: string): string {
  return `cards/${id}${langSuffix(lang, defaultLang)}.${version}.webp`
}

export function thumbKey(id: string, version: number, lang?: string, defaultLang?: string): string {
  return `cards/thumb/${id}${langSuffix(lang, defaultLang)}.${version}.webp`
}

// A horizontal card's thumb turned upright. Card faces are stored portrait, with
// a landscape card turned a quarter counter-clockwise onto the canvas; the web
// turns it back with CSS, but a Discord embed only takes a URL. Only horizontal
// cards have one, and it shares the thumb's version so both bust together.
export function landscapeThumbKey(id: string, version: number, lang?: string, defaultLang?: string): string {
  return `cards/landscape-thumb/${id}${langSuffix(lang, defaultLang)}.${version}.webp`
}

// Deck-hero art crop: a pre-cropped, upright character image baked at ingest time.
// Default-language only (no lang suffix) — the deck hero always shows the en art.
export function artCropKey(id: string, version: number): string {
  return `cards/art-crop/${id}.${version}.webp`
}

export function symbolKey(code: string, version: number): string {
  return `symbols/${code}.${version}.webp`
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
