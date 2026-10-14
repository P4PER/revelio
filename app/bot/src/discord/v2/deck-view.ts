import {
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  type ButtonBuilder,
  type ContainerBuilder,
} from 'discord.js'
import { artCropKey, clampDeckName, imageUrl } from '@revelio/core'
import type { DeckEntryView, DeckView } from '../../data/decks'
import { t } from '../../i18n/t'
import { deckUrl } from '../../links'
import { actionRow, container, lessonColor, linkButton, plain, text } from './parts'

export type DeckViewOptions = {
  locale: string
  imageBase: string
  siteBase: string
  // false leaves the page link off: a private deck posted to a channel would
  // otherwise link a page that answers "not found" for everyone but its owner.
  // Required, so a new caller has to decide rather than link by default.
  linkPage: boolean
  // The sheet's attachment name; the render service picks PNG or WebP, and the
  // gallery can only point at an upload by its name. Absent: the text lists.
  imageName?: string
  // A line above the heading: who shared the deck, on a post to a channel.
  lead?: string
  // Buttons ahead of the page link (Back and Post in the browser).
  actions?: ButtonBuilder[]
}

// Two zones of whole lines inside the message's 4000-character text budget,
// with room for the heading and the lead.
const LIST_LIMIT = 1500

// "(BS 75)" names the printing, since the same card name recurs across sets.
// Left off when the card row did not resolve rather than printing "( )".
function entryLine(entry: DeckEntryView): string {
  const line = `${entry.quantity}x ${entry.name}`
  return entry.setCode && entry.number ? `${line} (${entry.setCode} ${entry.number})` : line
}

// Whole lines, then how many copies were left out. A truncated card name would
// read as a data bug; an explicit remainder reads as a summary. The remainder
// counts copies because the zone heading does.
function cardList(entries: DeckEntryView[], locale: string): string {
  const lines: string[] = []
  let used = 0
  let left = entries.reduce((n, e) => n + e.quantity, 0)
  for (const entry of entries) {
    const line = entryLine(entry)
    const remainder = t(locale, 'deck.more', { count: left })
    if (used + line.length + 1 + remainder.length + 1 > LIST_LIMIT) {
      lines.push(remainder)
      break
    }
    lines.push(line)
    used += line.length + 1
    left -= entry.quantity
  }
  return lines.join('\n')
}

// The heading, as /decks draws a row: the name, the starting character under
// it (its art beside the heading when there is no sheet), and who, format and legality on one
// small line, since those are context rather than what a player reads for.
function headingText(deck: DeckView, locale: string): string {
  const owner = deck.ownerUsername
    ? t(locale, 'deck.footer', { owner: plain(deck.ownerUsername) })
    : t(locale, 'deck.footer.anonymous')
  const facts = [
    owner,
    t(locale, `deck.format.${deck.format}`),
    `${t(locale, `deck.statusMark.${deck.status}`)} ${t(locale, `deck.status.${deck.status}`)}`,
  ].join(' · ')
  // clampDeckName: a deck saved before the name bound can be any length.
  return [
    `## ${plain(clampDeckName(deck.name))}`,
    deck.character ? `**${plain(deck.character.name)}**` : '',
    `-# ${facts}`,
  ].filter(Boolean).join('\n')
}

export function deckView(deck: DeckView, opts: DeckViewOptions): ContainerBuilder[] {
  const { locale } = opts
  const view = container(lessonColor(deck.topLesson))
  const heading = headingText(deck, locale)
  const content = text(opts.lead ? `${opts.lead}\n${heading}` : heading)
  // Only beside the text lists: the sheet already shows the starting character.
  const starter = opts.imageName ? undefined : deck.entries.find((e) => e.zone === 'character')
  if (deck.character && starter && starter.artCropVersion != null) {
    view.addSectionComponents(new SectionBuilder().addTextDisplayComponents(content).setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(imageUrl(opts.imageBase, artCropKey(starter.cardId, starter.artCropVersion)))
        .setDescription(t(locale, 'deck.characterLine', { name: deck.character.name })),
    ))
  } else {
    // A section must carry an accessory; no art, no section.
    view.addTextDisplayComponents(content)
  }

  if (opts.imageName) {
    // The picture shows every card, so the text lists would only repeat it.
    view.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${opts.imageName}`).setDescription(clampDeckName(deck.name)),
      ),
    )
  } else {
    if (deck.main.length) {
      view.addTextDisplayComponents(text(
        `**${t(locale, 'deck.field.main', { count: deck.mainCount })}**\n${cardList(deck.main, locale)}`,
      ))
    }
    if (deck.sideboard.length) {
      view.addTextDisplayComponents(text(
        `**${t(locale, 'deck.field.sideboard', { count: deck.sideboardCount })}**\n${cardList(deck.sideboard, locale)}`,
      ))
    }
  }

  const buttons = [
    ...(opts.actions ?? []),
    ...(opts.linkPage ? [linkButton(deckUrl(opts.siteBase, deck.id, locale), t(locale, 'deck.openSite'))] : []),
  ]
  // An action row with nothing in it is a 400.
  if (buttons.length) {
    view.addActionRowComponents(actionRow(...buttons))
  }
  return [view]
}
