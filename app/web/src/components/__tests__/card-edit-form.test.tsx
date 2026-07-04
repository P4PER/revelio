import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateLocalization = vi.fn(async () => ({ ok: true as const }))
const saveRulingsAction = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/lib/localization-actions', () => ({
  updateLocalization: (...a: unknown[]) => updateLocalization(...a),
}))
vi.mock('@/lib/rulings-actions', () => ({
  saveRulingsAction: (...a: unknown[]) => saveRulingsAction(...a),
}))
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import { CardEditForm } from '../card-edit-form'
import en from '@/../messages/en.json'

beforeEach(() => {
  updateLocalization.mockClear()
  saveRulingsAction.mockClear()
})

describe('CardEditForm', () => {
  it('saves both the localization and the rulings on a single Save click', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <CardEditForm
          cardId="x-1"
          lang="en"
          kind={null}
          locInitial={{
            name: 'Card',
            text: '',
            flavorText: '',
            status: 'machine',
            adventure: { effect: '', reward: '', toSolve: '' },
            match: { prize: '', toWin: '' },
          }}
          rulingsInitial={[]}
          sources={['POJO', 'Revival']}
        />
      </NextIntlClientProvider>,
    )
    // exactly one Save button (no per-section saves)
    expect(screen.getByRole('button', { name: en.edit.save })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: en.edit.saveRulings })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: en.edit.save }))
    expect(updateLocalization).toHaveBeenCalledTimes(1)
    expect(saveRulingsAction).toHaveBeenCalledTimes(1)
  })
})
