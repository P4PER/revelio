import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect } from 'vitest'
import { BOT_COMMANDS } from '@revelio/core'
import en from '@/../messages/en.json'
import { CommandPicker } from '@/components/discord/command-picker'

function renderPicker() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CommandPicker />
    </NextIntlClientProvider>,
  )
}

// The row a command's name sits in. The name is a span; /card also appears in
// the message box below the menu, which is why the lookup goes through the list.
function row(name: string) {
  const list = screen.getByRole('list')
  const label = [...list.querySelectorAll('span')].find((s) => s.textContent === `/${name}`)
  return label!.closest('li')!
}

describe('CommandPicker', () => {
  it('lists every command the bot registers', () => {
    renderPicker()
    for (const command of BOT_COMMANDS) {
      expect(row(command.name), command.name).toBeInTheDocument()
    }
  })

  // The grid used to keep its own option list and kept showing /search's
  // removed page option. Structure comes from the manifest.
  it('shows exactly the options the manifest declares', () => {
    renderPicker()
    for (const command of BOT_COMMANDS) {
      const pills = [...row(command.name).querySelectorAll('code')].map((c) => c.textContent)
      expect(pills, command.name).toEqual(command.options.map((o) => o.name))
    }
  })

  it('labels each row by who sees the answer', () => {
    renderPicker()
    for (const command of BOT_COMMANDS) {
      const text = row(command.name).textContent
      expect(text, command.name).toContain(command.ephemeral ? 'Only you' : 'Channel')
      expect(text, command.name).not.toContain(command.ephemeral ? 'Channel' : 'Only you')
    }
  })

  it('says when a command takes no options', () => {
    renderPicker()
    expect(row('mydecks').textContent).toContain('no options')
  })

  // The muted grey fell to 3.6:1 on the selected row. Descriptions and the
  // private label carry content, so they take Discord's secondary text
  // colour (#b5bac1, 5.1:1 there); the muted grey stays for metadata.
  it('draws descriptions and the private label in the readable grey', () => {
    renderPicker()
    const secondary = 'rgb(181, 186, 193)'
    for (const command of BOT_COMMANDS) {
      const li = row(command.name)
      expect(li.querySelector('p')!.style.color, command.name).toBe(secondary)
      if (command.ephemeral) {
        expect(li.lastElementChild!.getAttribute('style'), command.name).toMatch(/181, 186, 193|#b5bac1/i)
      }
    }
  })

  it('names the window for assistive tech', () => {
    renderPicker()
    expect(
      screen.getByRole('group', { name: "Revelio's commands as Discord lists them" }),
    ).toBeInTheDocument()
  })
})

// The hero's channel mock and the slash menu are the same Discord window twice
// on one page; the controls they share must be the same component, at one scale.
describe('the two Discord windows', () => {
  async function renderBoth() {
    const { CommandChannel } = await import('@/components/discord/command-channel')
    return render(
      <NextIntlClientProvider locale="en" messages={en}>
        <div data-window="hero">
          <CommandChannel />
        </div>
        <div data-window="picker">
          <CommandPicker />
        </div>
      </NextIntlClientProvider>,
    )
  }

  it('each end in the shared message box under the shared header', async () => {
    const { container } = await renderBoth()
    for (const name of ['hero', 'picker']) {
      const w = container.querySelector(`[data-window="${name}"]`)!
      expect(w.querySelectorAll('[data-message-box]')).toHaveLength(1)
      expect(w.querySelectorAll('[data-channel-header]')).toHaveLength(1)
    }
  })

  it('share one base text size and one message avatar size', async () => {
    const { container } = await renderBoth()
    const root = (name: string) => container.querySelector(`[data-window="${name}"] > div`)!
    expect(root('hero').className).toMatch(/(^|\s)text-sm(\s|$)/)
    expect(root('picker').className).toMatch(/(^|\s)text-sm(\s|$)/)
    // The hero's bot avatar matches the menu's history avatars (36px).
    const avatar = root('hero').querySelector('img[src*="revelio-icon"]')!.parentElement!
    expect(avatar.className).toMatch(/(^|\s)size-9(\s|$)/)
  })

  it('types the option the bot registers, outside the localized value', async () => {
    const { container } = await renderBoth()
    const box = container.querySelector('[data-window="hero"] [data-message-box]')!
    expect(box.textContent).toBe(`+/collectionset${en.discord.sample.typing}`)
  })
})
