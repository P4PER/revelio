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

  it('keeps the caret still under reduced motion', () => {
    renderPicker()
    const caret = document.querySelector('[data-caret]')!
    expect(caret.className).toMatch(/motion-reduce:animate-none/)
  })

  // The hero's message box leaves its flex gap before the caret; this one
  // must not pull the caret flush against the typed name.
  it('spaces the caret like the hero mock', () => {
    renderPicker()
    const caret = document.querySelector('[data-caret]')!
    expect(caret.className).not.toMatch(/(^|\s)-m[lx]-/)
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

// The hero's channel mock and the slash menu both end in Discord's message box,
// on the same page; the same control must look the same in both.
describe('the two message boxes', () => {
  it('draw the same caret and the same typed-option tint', async () => {
    const { CommandChannel } = await import('@/components/discord/command-channel')
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <CommandChannel />
        <CommandPicker />
      </NextIntlClientProvider>,
    )
    const carets = [...container.querySelectorAll('.animate-caret-blink')]
    expect(carets).toHaveLength(2)
    const size = (el: Element) => el.className.match(/\b[hw]-\S+/g)
    expect(size(carets[0])).toEqual(size(carets[1]))
    // The span the caret follows holds the typed option in each box.
    const tint = (el: Element) =>
      (el.parentElement!.querySelector('[style*="color"][class*="rounded"]') as HTMLElement).style.background
    expect(tint(carets[0])).toBe(tint(carets[1]))
  })
})
