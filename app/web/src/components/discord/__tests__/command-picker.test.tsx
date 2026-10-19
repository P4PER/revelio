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

  it('names the window for assistive tech', () => {
    renderPicker()
    expect(
      screen.getByRole('group', { name: "Revelio's commands as Discord lists them" }),
    ).toBeInTheDocument()
  })
})
