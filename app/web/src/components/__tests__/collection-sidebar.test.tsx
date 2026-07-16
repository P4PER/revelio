import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { CollectionSidebar } from '@/components/collection-sidebar'

const messages = { collection: { ofTotal: '{owned} / {total}' } }
const sets = [
  { code: 'BS', name: 'Base', releaseDate: null, isOfficial: true, cardCount: 3, symbol: null },
  { code: 'PR', name: 'Promo', releaseDate: null, isOfficial: false, cardCount: 1, symbol: null },
]
const progress = [
  { setCode: 'BS', owned: 2, total: 3 },
  { setCode: 'PR', owned: 0, total: 1 },
]

function wrap(ui: React.ReactNode) {
  return render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>)
}

describe('CollectionSidebar', () => {
  it('lists every set with its owned/total count', () => {
    wrap(<CollectionSidebar sets={sets} progress={progress} selected="BS" hrefFor={(c) => `?set=${c}`} />)
    expect(screen.getByText('Base')).toBeInTheDocument()
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(screen.getByText('0 / 1')).toBeInTheDocument()
  })
  it('marks the selected set active', () => {
    wrap(<CollectionSidebar sets={sets} progress={progress} selected="BS" hrefFor={(c) => `?set=${c}`} />)
    expect(screen.getByTestId('set-row-BS').dataset.active).toBe('true')
    expect(screen.getByTestId('set-row-PR').dataset.active).toBe('false')
  })
})
