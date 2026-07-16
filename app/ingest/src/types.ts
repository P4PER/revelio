export type DistSet = {
  code: string
  name: string
  releaseDate: string | null
  isOfficial: boolean
  cardCount: number
  symbol: string | null
}

export type DistLocalization = {
  name: string
  status: string | null
  source: string | null
  text: string | null
  flavorText: string | null
  adventure: unknown | null
  match: unknown | null
  image: { file: string | null; url: string | null } | null
}

export type DistCard = {
  id: string
  name: string
  setCode: string
  number: string
  types: string[]
  subTypes: string[]
  lesson: string | null
  cost: number | null
  provides: unknown | null
  rarity: string | null
  finishes: string[]
  artist: string[]
  stats: { health: number | null; damagePerTurn: number | null } | null
  orientation: string | null
  legality: string | null
  draftValue: number | null
  rulings: unknown[]
  defaultLanguage: string
  languages: string[]
  localizations: Record<string, DistLocalization>
}
