import { SectionBuilder, ThumbnailBuilder, type ContainerBuilder } from 'discord.js'
import { attrLabel } from '@revelio/core'
import { clampLabel } from '../../data/cards'
import type { CardBrowseHit } from '@revelio/search'
import { t } from '../../i18n/t'
import { cardThumbUrl, text } from './parts'

export type CardRowOptions = { locale: string; imageBase: string }

// "**Name** <dot> set #number", then "Type <dot> Lesson <dot> Cost n" (a middle
// dot between parts) - whatever the card has.
export function cardRowText(hit: CardBrowseHit, locale: string): string {
  const title = t(locale, 'search.line', { name: hit.name, setCode: hit.setCode, number: hit.number })
  const stats = [
    hit.types.map((code) => attrLabel('types', code, locale)).join(', '),
    hit.lesson ? attrLabel('lessons', hit.lesson, locale) : '',
    hit.cost != null ? `${t(locale, 'card.field.cost')} ${hit.cost}` : '',
  ].filter(Boolean).join(' · ')
  return stats ? `${title}\n${stats}` : title
}

// One result row: a section with the card's thumbnail beside its text, or plain
// text for a card with no image, since a section must carry an accessory.
// Three components with a thumbnail (section, text, thumbnail), one without.
export function addCardRow(view: ContainerBuilder, hit: CardBrowseHit, opts: CardRowOptions): void {
  const content = cardRowText(hit, opts.locale)
  const thumb = cardThumbUrl(hit, opts.imageBase)
  if (!thumb) {
    view.addTextDisplayComponents(text(content))
    return
  }
  view.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(text(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb).setDescription(hit.name)),
  )
}

// A card as a select option, for "Open a card", the share picker and "View a
// card": its name, and its printing to tell reprints apart.
export function cardOption(hit: CardBrowseHit, selected = false) {
  return {
    label: clampLabel(hit.name),
    description: `${hit.setCode} #${hit.number}`,
    value: hit.id,
    default: selected,
  }
}
