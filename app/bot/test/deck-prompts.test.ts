import { describe, it, expect, vi } from 'vitest'
import type { DeckSuggestion } from '@revelio/db'
import {
  awaitChoice, pickPrompt, visibilityPrompt, PICK_ID, POST_ID, PROMPT_TIMEOUT_MS, SELF_ID,
} from '../src/discord/components/deck-prompts'

const suggestion = (id: string): DeckSuggestion => ({
  id, name: `Deck ${id}`, format: 'classic', author: 'seeker', visibility: 'public', isOwn: false,
})

describe('visibilityPrompt', () => {
  it('names the deck and offers post and self buttons', () => {
    const prompt = visibilityPrompt('Secret Charms', 'en')
    expect(prompt.content).toContain('Secret Charms')
    const ids = prompt.components[0].toJSON().components.map((c) => (c as { custom_id: string }).custom_id)
    expect(ids).toEqual([POST_ID, SELF_ID])
  })
})

describe('pickPrompt', () => {
  it('offers at most 25 decks, valued by id', () => {
    const prompt = pickPrompt(Array.from({ length: 30 }, (_, i) => suggestion(String(i))), 'en')
    const menu = prompt.components[0].toJSON().components[0] as { custom_id: string; options: { value: string }[] }
    expect(menu.custom_id).toBe(PICK_ID)
    expect(menu.options).toHaveLength(25)
    expect(menu.options[0].value).toBe('0')
  })
})

describe('awaitChoice', () => {
  it('accepts only the user who ran the command, within the timeout', async () => {
    const awaitMessageComponent = vi.fn().mockResolvedValue({ customId: POST_ID })
    await awaitChoice({ awaitMessageComponent } as never, '111')
    const { filter, time } = awaitMessageComponent.mock.calls[0][0]
    expect(time).toBe(PROMPT_TIMEOUT_MS)
    expect(filter({ user: { id: '111' } })).toBe(true)
    expect(filter({ user: { id: '222' } })).toBe(false)
  })

  it('returns null when the collector times out', async () => {
    const awaitMessageComponent = vi.fn().mockRejectedValue(new Error('time'))
    expect(await awaitChoice({ awaitMessageComponent } as never, '111')).toBeNull()
  })
})
