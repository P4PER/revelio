// The transport/domain shape shared by the API and the frontend (distinct from the
// Drizzle persistence rows in @revelio/db). Grows as the web app is built.
export type SetDTO = {
  code: string
  name: string
  releaseDate: string | null
  isOfficial: boolean
  cardCount: number
  symbol: string | null
}

export type CardLocalizationDTO = {
  lang: string
  name: string
  status: string | null
  source: string | null
  text: string | null
  flavorText: string | null
  imageFile: string | null
  imageUrl: string | null
}

export type CardDTO = {
  id: string
  setCode: string
  number: string
  name: string
  // attribute codes (slugs); the FE joins these to the attribute term DTOs below
  types: string[]
  subTypes: string[]
  lesson: string | null
  cost: number | null
  rarity: string | null
  finish: string | null
  legality: string | null
  localizations: Record<string, CardLocalizationDTO>
}

// An attribute term as the API returns it for facets/filters: the DB code plus the
// i18n-resolved display label for the request language.
export type AttributeTermDTO = {
  code: string
  label: string
  sortOrder: number
}

export type LessonDTO = AttributeTermDTO & { color: string | null }
