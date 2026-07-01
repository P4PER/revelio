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
  types: string[]
  subTypes: string[]
  lesson: string | null
  cost: number | null
  rarity: string | null
  finish: string | null
  legality: string | null
  localizations: Record<string, CardLocalizationDTO>
}
