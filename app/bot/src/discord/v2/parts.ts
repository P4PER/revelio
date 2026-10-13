import { ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder } from 'discord.js'
import { LESSONS } from '@revelio/core'

// The search accent, as the embed used it.
export const BRAND_GOLD = 0xd4a83a
// Discord's own dark surface: an accent that reads as "none" for a card or
// deck with no lesson.
const FALLBACK_COLOR = 0x2b2d31

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

export function linkButton(url: string, label: string): ButtonBuilder {
  return new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(label)
}
