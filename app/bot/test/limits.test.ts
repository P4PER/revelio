import { describe, it, expect } from 'vitest'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import { assertWithinLimits, measure } from '../src/discord/v2/limits'

const text = (content: string) => new TextDisplayBuilder().setContent(content)
const withTexts = (n: number, content = 'x') =>
  new ContainerBuilder().addTextDisplayComponents(...Array.from({ length: n }, () => text(content)))

describe('measure', () => {
  it('counts the container and every nested component', () => {
    const section = new SectionBuilder()
      .addTextDisplayComponents(text('a'), text('b'))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL('https://img.test/a.webp'))
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('v1:pk').setLabel('x').setStyle(ButtonStyle.Primary),
    )
    const message = new ContainerBuilder().addSectionComponents(section).addActionRowComponents(row)
    // container 1 + section 1 + two texts 2 + thumbnail 1 + row 1 + button 1
    expect(measure([message]).components).toBe(7)
  })

  it('sums text display characters across the message', () => {
    expect(measure([withTexts(3, 'abcd')]).text).toBe(12)
  })
})

describe('assertWithinLimits', () => {
  it('accepts exactly 40 components', () => {
    expect(() => assertWithinLimits([withTexts(39)])).not.toThrow()
  })

  it('rejects 41 components, nested ones included', () => {
    expect(() => assertWithinLimits([withTexts(40)])).toThrow(/41 components/)
  })

  it('accepts exactly 4000 text characters and rejects 4001', () => {
    expect(() => assertWithinLimits([withTexts(2, 'a'.repeat(2000))])).not.toThrow()
    const over = new ContainerBuilder().addTextDisplayComponents(text('a'.repeat(2000)), text('b'.repeat(2001)))
    expect(() => assertWithinLimits([over])).toThrow(/4001 text characters/)
  })
})
