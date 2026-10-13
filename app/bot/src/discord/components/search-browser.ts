import { LESSONS, TYPES } from '@revelio/core'
import type { MessageComponentInteraction } from 'discord.js'
import type { Deps } from '../../clients'
import { findCards } from '../../data/cards'
import { toRevelioLocale } from '../../i18n/locale'
import { searchView, ANY } from '../v2/search-view'
import { v2Edit, type V2Edit } from '../v2/send'
import type { CardBrowseState, CardKind, CustomId } from './custom-id'
import type { ComponentHandler } from './types'

type CardStateId = { kind: CardKind; state: CardBrowseState }

const LESSON_CODES: readonly string[] = LESSONS.map((l) => l.code)
const TYPE_CODES: readonly string[] = TYPES.map((ty) => ty.code)

export function isCardState(id: CustomId): id is CardStateId {
  return 'state' in id && !('scope' in id.state)
}

// The one select value a click carries, or null for "Any" and anything that is
// not a select click.
function picked(interaction: MessageComponentInteraction): string | null {
  if (!interaction.isStringSelectMenu()) return null
  const value = interaction.values[0]
  return value && value !== ANY ? value : null
}

export async function renderSearchBrowser(
  deps: Deps,
  state: CardBrowseState,
  locale: string,
  canPost: boolean,
): Promise<V2Edit> {
  const [page, sets] = await Promise.all([
    findCards(deps.meili, {
      query: state.query,
      locale,
      page: state.page,
      filters: {
        ...(state.lesson ? { lesson: [state.lesson] } : {}),
        ...(state.type ? { types: [state.type] } : {}),
        ...(state.set ? { setCode: [state.set] } : {}),
      },
    }),
    deps.sets.all(locale),
  ])
  return v2Edit(searchView(page, state, {
    locale,
    imageBase: deps.env.IMAGE_BASE_URL,
    siteBase: deps.env.SITE_BASE_URL,
    sets,
    canPost,
  }))
}

// Every browser click is on the caller's own private message: acknowledge
// without a visible change, then replace the message.
async function show(interaction: MessageComponentInteraction, deps: Deps, state: CardBrowseState): Promise<void> {
  await interaction.deferUpdate()
  const locale = toRevelioLocale(interaction.locale)
  await interaction.editReply(await renderSearchBrowser(deps, state, locale, interaction.inGuild()))
}

// A filter value is client data: anything that is not a real lesson, type or
// set clears the filter rather than reaching the Meilisearch query.
const navigate: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  await show(interaction, deps, id.state)
}

const filterLesson: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  const value = picked(interaction)
  const lesson = value && LESSON_CODES.includes(value) ? value : null
  await show(interaction, deps, { ...id.state, lesson, page: 1 })
}

const filterType: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  const value = picked(interaction)
  const type = value && TYPE_CODES.includes(value) ? value : null
  await show(interaction, deps, { ...id.state, type, page: 1 })
}

const filterSet: ComponentHandler = async (interaction, id, deps) => {
  if (!isCardState(id)) return
  const value = picked(interaction)
  const sets = await deps.sets.all(toRevelioLocale(interaction.locale))
  const set = value && sets.some((s) => s.code === value) ? value : null
  await show(interaction, deps, { ...id.state, set, page: 1 })
}

export const SEARCH_HANDLERS: readonly (readonly [CustomId['kind'], ComponentHandler])[] = [
  ['s', navigate],
  ['sl', filterLesson],
  ['st', filterType],
  ['ss', filterSet],
]
