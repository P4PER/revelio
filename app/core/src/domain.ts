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

export type AdventureData = { effect: string | null; reward: string | null; toSolve: string | null }
export type MatchData = { prize: string | null; toWin: string | null }

export type CardLocalizationDTO = {
  lang: string
  name: string
  status: string | null
  source: string | null
  text: string | null
  flavorText: string | null
  imageFile: string | null
  imageUrl: string | null
  adventure: AdventureData | null
  match: MatchData | null
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

export type RulingDTO = {
  id: string
  seq: number
  date: string | null
  source: string | null
  text: Record<string, string>
}

// The full card as the detail page needs it (superset of CardDTO).
export type CardDetailDTO = CardDTO & {
  artist: string[]
  health: number | null
  damagePerTurn: number | null
  orientation: string | null
  defaultLanguage: string
  rulings: RulingDTO[]
  set: SetDTO
}
