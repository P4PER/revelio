import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type Message,
  type MessageActionRowComponentBuilder,
  type MessageComponentInteraction,
} from 'discord.js'
import type { DeckSuggestion } from '@revelio/db'
import { suggestionLabel } from '../../data/decks'
import { t } from '../../i18n/t'

export type DeckPrompt = {
  content: string
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[]
}

// Plain constants, nothing encoded: the collector's closure already holds the
// deck id, so a custom id only has to say which control was used.
export const POST_ID = 'deck:post'
export const SELF_ID = 'deck:self'
export const PICK_ID = 'deck:pick'

// Long enough to read a yes/no prompt, short enough that an abandoned one does
// not hold a collector open. A bot restart inside this window leaves the
// buttons dead; that was accepted over a stateless router that would have to
// re-authorize every click (spec section 5).
export const PROMPT_TIMEOUT_MS = 60_000

const MAX_OPTIONS = 25

export function visibilityPrompt(name: string, locale: string): DeckPrompt {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(POST_ID).setLabel(t(locale, 'deck.private.post')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(SELF_ID).setLabel(t(locale, 'deck.private.self')).setStyle(ButtonStyle.Secondary),
  )
  return { content: t(locale, 'deck.private.prompt', { name }), components: [row] }
}

export function pickPrompt(options: DeckSuggestion[], locale: string): DeckPrompt {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(PICK_ID)
    .setPlaceholder(t(locale, 'deck.pick.placeholder'))
    .addOptions(options.slice(0, MAX_OPTIONS).map((o) => ({ label: suggestionLabel(o, locale), value: o.id })))
  return {
    content: t(locale, 'deck.ambiguous'),
    components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu)],
  }
}

// The prompt is ephemeral, but the filter is the guarantee: only the person
// who ran /deck can answer it. A timeout (or any collector error) is null.
export async function awaitChoice(
  message: Message,
  userId: string,
): Promise<MessageComponentInteraction | null> {
  try {
    return await message.awaitMessageComponent({
      filter: (i) => i.user.id === userId,
      time: PROMPT_TIMEOUT_MS,
    })
  } catch {
    return null
  }
}
