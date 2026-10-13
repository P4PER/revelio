import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import { imageUrl, landscapeThumbKey, LESSONS, thumbKey } from '@revelio/core'
import type { SearchDocument } from '@revelio/search'

type ThumbSource = Pick<SearchDocument, 'id' | 'imageVersion' | 'imageLang' | 'defaultLanguage' | 'orientation'>

// The search accent, as the embed used it.
export const BRAND_GOLD = 0xd4a83a
// Discord's own dark surface: an accent that reads as "none" for a card or
// deck with no lesson.
const FALLBACK_COLOR = 0x2b2d31
// Markdown's active characters, plus `<` so a typed "<@123>" or "<#1>" renders
// as text rather than as a mention or channel link.
const MARKDOWN = /[\\`*_~|>#\-[\]()<]/g

export function lessonColor(lesson: string | null): number {
  const hex = LESSONS.find((l) => l.code === lesson)?.color
  return hex ? parseInt(hex.slice(1), 16) : FALLBACK_COLOR
}

// Every V2 message is one container; this is where it starts.
export function container(accent: number | null = null): ContainerBuilder {
  const view = new ContainerBuilder()
  return accent == null ? view : view.setAccentColor(accent)
}

export function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content)
}

export function actionRow(
  ...components: MessageActionRowComponentBuilder[]
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...components)
}

export function linkButton(url: string, label: string): ButtonBuilder {
  return new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(label)
}

// User text inside a text display. Discord renders markdown there, masked
// links included, so a query or a deck name could otherwise post a link that
// reads as anything at all - in a message the bot sends.
export function plain(value: string): string {
  return value.replace(MARKDOWN, '\\$&')
}

// Card faces are stored portrait, so a horizontal card uses its pre-baked
// landscape thumb to read upright. The 300px thumb, never the full image.
export function cardThumbUrl(card: ThumbSource, imageBase: string): string | null {
  if (!card.imageLang || card.imageVersion == null) return null
  const keyOf = card.orientation === 'horizontal' ? landscapeThumbKey : thumbKey
  return imageUrl(imageBase, keyOf(card.id, card.imageVersion, card.imageLang, card.defaultLanguage))
}
