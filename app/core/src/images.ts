export function imageKey(id: string, lang?: string, defaultLang?: string): string {
  return lang && defaultLang && lang !== defaultLang ? `cards/${id}.${lang}.webp` : `cards/${id}.webp`
}

export function thumbKey(id: string, lang?: string, defaultLang?: string): string {
  return lang && defaultLang && lang !== defaultLang
    ? `cards/thumb/${id}.${lang}.webp`
    : `cards/thumb/${id}.webp`
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
