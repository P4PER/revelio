import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/../i18n/navigation', () => ({
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))

import { CardDetail } from '../card-detail'
import en from '@/../messages/en.json'

const card = {
  id: 'x-1', setCode: 'X', number: '1', name: 'Card', types: [], subTypes: [],
  lesson: null, cost: null, rarity: null, finish: null, legality: null, artist: [],
  health: null, damagePerTurn: null, orientation: null, defaultLanguage: 'en',
  localizations: { en: { lang: 'en', name: 'Card', status: 'official', source: null, text: null, flavorText: null, imageFile: null, imageUrl: null } },
  rulings: [],
  set: { code: 'X', name: 'Xen', releaseDate: null, isOfficial: true, symbol: null },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

function renderDetail(canEdit: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CardDetail card={card} locale="en" imageBase="" canEdit={canEdit} />
    </NextIntlClientProvider>,
  )
}

describe('CardDetail edit link', () => {
  it('shows an Edit link for editors', () => {
    renderDetail(true)
    expect(screen.getByRole('link', { name: en.edit.button })).toHaveAttribute('href', '/card/x-1/edit')
  })
  it('hides the Edit link otherwise', () => {
    renderDetail(false)
    expect(screen.queryByRole('link', { name: en.edit.button })).not.toBeInTheDocument()
  })
})
