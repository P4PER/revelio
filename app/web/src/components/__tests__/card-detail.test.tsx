import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import { CardDetail } from '../card-detail'
import type { CardDetailDTO } from '@revelio/core'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => <img alt={p.alt as string} /> }))

const messages = {
  card: {
    number: 'No. {number}', cost: 'Cost', machineTranslation: 'Machine translation',
    health: 'Health', damage: 'Damage/turn', legality: 'Legality',
    artist: 'Illustrated by', rulings: 'Rulings',
  },
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider locale="en" messages={messages}>{children}</NextIntlClientProvider>
}

const card: CardDetailDTO = {
  id: 'bs-1-fluffy', setCode: 'BS', number: '1', name: 'Fluffy', types: ['creature'], subTypes: ['beast'],
  lesson: 'charms', cost: 3, rarity: 'rare', finish: null, legality: 'legal', artist: ['An Artist'],
  health: 5, damagePerTurn: 2, orientation: 'vertical', defaultLanguage: 'en',
  localizations: {
    en: { lang: 'en', name: 'Fluffy', status: 'official', source: null, text: 'Guards it.', flavorText: 'Woof.', imageFile: null, imageUrl: null },
    de: { lang: 'de', name: 'Fluffy', status: 'machine', source: null, text: 'Bewacht.', flavorText: null, imageFile: null, imageUrl: null },
  },
  rulings: [{ seq: 1, date: '2001-06-01', source: 'FAQ', text: { en: 'Sleeps to music.' } }],
  set: { code: 'BS', name: 'Base Set', releaseDate: '2001-01-01', isOfficial: true, cardCount: 1, symbol: 'BS' },
}

describe('CardDetail', () => {
  it('renders a horizontal card upright at rotated-vertical size (landscape frame)', () => {
    const horizontal = { ...card, orientation: 'horizontal' as const,
      localizations: { ...card.localizations,
        en: { ...card.localizations.en, imageFile: 'bs-1-fluffy.webp' } } }
    const { container } = render(<CardDetail card={horizontal} locale="en" imageBase="http://img" />, { wrapper: Wrapper })
    expect(container.querySelector('.aspect-\\[7\\/5\\]')).not.toBeNull()
    expect(container.querySelector('.rotate-90')).not.toBeNull()
    expect(container.querySelector('.md\\:w-\\[476px\\]')).not.toBeNull()
  })

  it('renders a vertical card in a portrait frame', () => {
    const vertical = { ...card,
      localizations: { ...card.localizations,
        en: { ...card.localizations.en, imageFile: 'bs-1-fluffy.webp' } } }
    const { container } = render(<CardDetail card={vertical} locale="en" imageBase="http://img" />, { wrapper: Wrapper })
    expect(container.querySelector('.aspect-\\[5\\/7\\]')).not.toBeNull()
    expect(container.querySelector('.rotate-90')).toBeNull()
  })

  it('renders the localized card with rules text, rulings and artist', () => {
    render(<CardDetail card={card} locale="en" imageBase="http://img" />, { wrapper: Wrapper })
    expect(screen.getByRole('heading', { name: 'Fluffy' })).toBeInTheDocument()
    expect(screen.getByText('Guards it.')).toBeInTheDocument()
    expect(screen.getByText(/Sleeps to music\./)).toBeInTheDocument()
    expect(screen.getByText(/An Artist/)).toBeInTheDocument()
    expect(screen.getByText(/Beast/)).toBeInTheDocument() // sub-type in the text type-line
    expect(screen.queryByTestId('machine-badge')).toBeNull()
  })
  it('shows the machine-translation badge for a machine localization', () => {
    render(<CardDetail card={card} locale="de" imageBase="http://img" />, { wrapper: Wrapper })
    expect(screen.getByTestId('machine-badge')).toBeInTheDocument()
    expect(screen.getByText('Bewacht.')).toBeInTheDocument()
  })
  it('prefers translated sub-type labels and humanizes the rest', () => {
    const multiSubTypeCard = { ...card, subTypes: ['wizard', 'death_eater'] }
    render(
      <CardDetail
        card={multiSubTypeCard}
        locale="en"
        imageBase="http://img"
        subTypeLabels={{ wizard: 'Zauberer' }}
      />,
      { wrapper: Wrapper },
    )
    expect(screen.getByText(/Zauberer/)).toBeInTheDocument()
    expect(screen.getByText(/Death Eater/)).toBeInTheDocument()
  })
})
