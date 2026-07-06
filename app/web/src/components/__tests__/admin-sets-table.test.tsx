import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import type { SetDTO } from '@revelio/core'
import { AdminSetsTable } from '../admin-sets-table'

vi.mock('@/../i18n/navigation', () => ({
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))

const sets: SetDTO[] = [
  { code: 'BS', name: 'Base Set', releaseDate: '2001-08-01', isOfficial: true, cardCount: 116, symbol: 'BS' },
  { code: 'QC', name: 'Quidditch Cup', releaseDate: '2001-11-01', isOfficial: true, cardCount: 80, symbol: null },
  { code: 'FAN1', name: 'Custom Fan Pack', releaseDate: '2020-01-01', isOfficial: false, cardCount: 12, symbol: null },
]

function renderTable(rows = sets) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AdminSetsTable sets={rows} imageBase="http://img" />
    </NextIntlClientProvider>,
  )
}

// Data row names, in DOM order (name cells are links). Excludes the header row.
function rowNames(): string[] {
  return screen.getAllByRole('link').map((a) => a.textContent ?? '')
}

beforeEach(() => vi.clearAllMocks())

describe('AdminSetsTable', () => {
  it('renders a linked row per set with an edit href', () => {
    renderTable()
    expect(screen.getByText('Base Set')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Custom Fan Pack' })).toHaveAttribute('href', '/admin/sets/FAN1/edit')
    expect(rowNames()).toHaveLength(3)
  })

  it('searches by name and by code', () => {
    renderTable()
    const search = screen.getByPlaceholderText('Search name or code…')
    fireEvent.change(search, { target: { value: 'quidditch' } })
    expect(rowNames()).toEqual(['Quidditch Cup'])
    fireEvent.change(search, { target: { value: 'FAN1' } }) // by code
    expect(rowNames()).toEqual(['Custom Fan Pack'])
  })

  it('clears the search with the ✕ button', () => {
    renderTable()
    const search = screen.getByPlaceholderText('Search name or code…')
    fireEvent.change(search, { target: { value: 'quidditch' } })
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect((search as HTMLInputElement).value).toBe('')
    expect(rowNames()).toHaveLength(3)
  })

  it('shows all sets when no filter toggle is active, and filters per toggle', () => {
    renderTable()
    expect(rowNames()).toHaveLength(3) // none active → all
    fireEvent.click(screen.getByRole('button', { name: 'Official' }))
    expect(rowNames().sort()).toEqual(['Base Set', 'Quidditch Cup'])
    fireEvent.click(screen.getByRole('button', { name: 'Official' })) // toggle off
    fireEvent.click(screen.getByRole('button', { name: 'Fan' }))
    expect(rowNames()).toEqual(['Custom Fan Pack'])
    fireEvent.click(screen.getByRole('button', { name: 'Official' })) // both active → all
    expect(rowNames()).toHaveLength(3)
  })

  it('sorts by a column header and toggles direction on re-click', () => {
    renderTable()
    fireEvent.click(screen.getByRole('button', { name: /Name/ }))
    expect(rowNames()).toEqual(['Base Set', 'Custom Fan Pack', 'Quidditch Cup']) // asc
    fireEvent.click(screen.getByRole('button', { name: /Name/ }))
    expect(rowNames()).toEqual(['Quidditch Cup', 'Custom Fan Pack', 'Base Set']) // desc
  })

  it('shows the empty state when nothing matches', () => {
    renderTable()
    fireEvent.change(screen.getByPlaceholderText('Search name or code…'), { target: { value: 'zzz' } })
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByText('No matches')).toBeInTheDocument()
  })

  it('renders the set code as a symbol-cell fallback when the set has no symbol', () => {
    renderTable()
    // QC has symbol: null → its code shows in BOTH the Code column and the symbol-cell fallback.
    expect(screen.getAllByText('QC')).toHaveLength(2)
    // BS has a symbol → symbol cell renders <SetSymbol>, not text, so its code shows only in the Code column.
    expect(screen.getAllByText('BS')).toHaveLength(1)
  })
})
