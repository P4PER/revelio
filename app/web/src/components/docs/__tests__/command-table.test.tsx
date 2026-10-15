import { render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect } from 'vitest'
import { BOT_COMMANDS, LESSONS, TYPES, attrLabel } from '@revelio/core'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'
import { CommandTable } from '@/components/docs/command-table'

function renderTable(name: string, locale: 'en' | 'de' = 'en', messages: typeof en | typeof de = en) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <CommandTable name={name as 'search'} />
    </NextIntlClientProvider>,
  )
}

describe('CommandTable', () => {
  it('names the command it documents', () => {
    renderTable('search')
    expect(screen.getByText('/search')).toBeInTheDocument()
  })

  // The whole reason the manifest exists: add an option to the bot and this
  // table grows a row without anyone editing a content file.
  it('renders a row for every option the manifest declares', () => {
    renderTable('search')
    for (const option of BOT_COMMANDS.find((c) => c.name === 'search')!.options) {
      expect(screen.getByText(option.name)).toBeInTheDocument()
    }
  })

  it('marks a required option as required', () => {
    renderTable('card')
    const row = screen.getByText('name').closest('tr')!
    expect(within(row).getByText('Required')).toBeInTheDocument()
  })

  it('marks an optional option as optional', () => {
    renderTable('search')
    const optional = screen.getByText('set').closest('tr')!
    expect(within(optional).getByText('Optional')).toBeInTheDocument()
  })

  it('states the length cap of a capped option', () => {
    renderTable('search')
    const row = screen.getByText('query').closest('tr')!
    expect(within(row).getByText(/At most 50 characters\./)).toBeInTheDocument()
  })

  it('calls an option with choices a choice, not text', () => {
    renderTable('search')
    const row = screen.getByText('lesson').closest('tr')!
    expect(within(row).getByText('Choice')).toBeInTheDocument()
  })

  // The manifest names a scope rather than listing values, so the table has to
  // resolve them - otherwise a new lesson would be missing from the docs.
  it('lists every value a choice option accepts', () => {
    renderTable('search')
    const lessonRow = screen.getByText('lesson').closest('tr')!
    expect(within(lessonRow).getAllByRole('listitem').map((li) => li.textContent)).toEqual(
      LESSONS.map((lesson) => attrLabel('lessons', lesson.code, 'en')),
    )

    const typeRow = screen.getByText('type').closest('tr')!
    expect(within(typeRow).getAllByRole('listitem').map((li) => li.textContent)).toEqual(
      TYPES.map((type) => attrLabel('types', type.code, 'en')),
    )
  })

  // Autocomplete is structure, so it comes from the manifest flag rather than
  // from a sentence someone remembered to write. Flip the flag in the bot and
  // this marker goes with it.
  it('marks an autocompleting option from the manifest flag', () => {
    renderTable('search')
    const autocompleting = screen.getByText('set').closest('tr')!
    expect(within(autocompleting).getByText('Autocompletes')).toBeInTheDocument()
    const plain = screen.getByText('query').closest('tr')!
    expect(within(plain).queryByText('Autocompletes')).toBeNull()
  })

  // A personal command's answer is nobody else's business, and the page must
  // not imply it lands in the channel.
  it('marks a personal command as private and account-linked', () => {
    renderTable('collection')
    expect(screen.getByText('Only you see it')).toBeInTheDocument()
    expect(screen.getByText('Needs a linked account')).toBeInTheDocument()
  })

  // The badges are indigo text at 0.68rem on the card, so they take the text
  // ink; theme-contrast.test.ts holds secondary-ink to AA there in both themes.
  it('draws the indigo badges in the indigo text ink', () => {
    renderTable('collection')
    expect(screen.getByText('Needs a linked account')).toHaveClass('text-secondary-ink')
    expect(screen.getByText('Autocompletes')).toHaveClass('text-secondary-ink')
  })

  it('marks a public command as posting to the channel', () => {
    renderTable('card')
    expect(screen.getByText('Posts to the channel')).toBeInTheDocument()
    expect(screen.queryByText('Only you see it')).toBeNull()
  })

  it('says so plainly when a command takes no options', () => {
    renderTable('mydecks')
    expect(screen.getByText('Takes no options.')).toBeInTheDocument()
  })

  it('renders German labels and German notes', () => {
    renderTable('search', 'de', de)
    // /search has two choice options, so "Auswahl" is not unique.
    expect(screen.getByText(/Höchstens 50 Zeichen\./)).toBeInTheDocument()
    expect(screen.getAllByText('Auswahl')).toHaveLength(2)
    expect(screen.getByText(/Schränkt auf eine Lektion ein/)).toBeInTheDocument()
    // Option names stay untranslated: this is what a German user types.
    expect(screen.getByText('query')).toBeInTheDocument()
  })

  // A fixed choice list has no attribute scope to resolve through attrLabel, so
  // its labels come from the catalog instead - and it is still a choice.
  it('lists the values of a fixed choice option', () => {
    renderTable('deck')
    const row = screen.getByText('view').closest('tr')!
    expect(within(row).getByText('Choice')).toBeInTheDocument()
    expect(within(row).getAllByRole('listitem').map((li) => li.textContent))
      .toEqual(['Image', 'List'])
  })

  it('translates the values of a fixed choice option', () => {
    renderTable('deck', 'de', de)
    const row = screen.getByText('view').closest('tr')!
    expect(within(row).getAllByRole('listitem').map((li) => li.textContent))
      .toEqual(['Bild', 'Liste'])
  })

  it('translates the choice values it lists', () => {
    renderTable('search', 'de', de)
    const lessonRow = screen.getByText('lesson').closest('tr')!
    expect(within(lessonRow).getAllByRole('listitem').map((li) => li.textContent)).toEqual(
      LESSONS.map((lesson) => attrLabel('lessons', lesson.code, 'de')),
    )
  })
})

// Structure lives in the manifest, prose lives in the catalog. This is the
// guard on the prose half: a new option with no note renders a blank cell.
describe('every manifest option has a note in both locales', () => {
  it.each(
    BOT_COMMANDS.flatMap((command) =>
      command.options.map((option) => [command.name, option.name] as const),
    ),
  )('%s.%s', (command, option) => {
    for (const messages of [en.docs, de.docs] as const) {
      const notes = (
        messages.commands as Record<string, { options: Record<string, string> }>
      )[command]?.options
      expect(notes?.[option], `${command}.${option}`).toBeTruthy()
    }
  })
})
