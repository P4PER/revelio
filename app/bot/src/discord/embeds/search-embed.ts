import { EmbedBuilder } from 'discord.js'
import type { CardPage } from '../../data/cards'
import { t } from '../../i18n/t'
import { searchUrl, type SearchLinkFilters } from '../../links'

const DESCRIPTION_LIMIT = 4096
const BRAND_GOLD = 0xd4a83a

export type SearchEmbedOptions = {
  locale: string
  query: string
  siteBase: string
  filters?: SearchLinkFilters
}

export function searchEmbed(page: CardPage, opts: SearchEmbedOptions): EmbedBuilder {
  const { locale } = opts
  const lines: string[] = []
  for (const hit of page.hits) {
    const line = t(locale, 'search.line', {
      name: hit.name, setCode: hit.setCode, number: hit.number,
    })
    // Stop before the limit rather than truncating mid-line: a half-rendered
    // card name reads as a bug.
    if (lines.join('\n').length + line.length + 1 > DESCRIPTION_LIMIT) break
    lines.push(line)
  }
  const embed = new EmbedBuilder()
    .setTitle(t(locale, 'search.title', { total: page.total }))
    .setURL(searchUrl(opts.siteBase, opts.query, locale, opts.filters))
    .setColor(BRAND_GOLD)
    .setFooter({ text: t(locale, 'search.footer', { page: page.page, pages: page.pages }) })
  // Discord rejects an empty description outright. Callers guard against an
  // empty page, but a renderer that throws on validly-shaped input is a trap
  // for the later phases that reuse it.
  if (lines.length) embed.setDescription(lines.join('\n'))
  return embed
}
