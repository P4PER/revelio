import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateLocalization = vi.fn(async () => ({ ok: true as const }))
const saveRulingsAction = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/lib/actions/localization-actions', () => ({
  updateLocalization: (...a: unknown[]) => updateLocalization(...a),
}))
vi.mock('@/lib/actions/rulings-actions', () => ({
  saveRulingsAction: (...a: unknown[]) => saveRulingsAction(...a),
}))
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))
const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a), warning: vi.fn() } }))

import { CardEditForm } from '@/components/card/card-edit-form'
import en from '@/../messages/en.json'

function renderForm() {
  return render(
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
}

beforeEach(() => {
  updateLocalization.mockClear()
  saveRulingsAction.mockClear()
  toastError.mockClear()
})

describe('CardEditForm', () => {
  it('saves both the localization and the rulings on a single Save click', async () => {
    renderForm()
    await userEvent.click(screen.getByRole('button', { name: en.edit.save }))
    expect(updateLocalization).toHaveBeenCalledTimes(1)
    expect(saveRulingsAction).toHaveBeenCalledTimes(1)
  })

  it('saves nothing while a ruling row is incomplete', async () => {
    renderForm()
    await userEvent.type(screen.getByLabelText(en.edit.name), ' renamed')
    await userEvent.click(screen.getByRole('button', { name: en.edit.addRuling }))
    await userEvent.click(screen.getByRole('button', { name: en.edit.save }))
    expect(updateLocalization).not.toHaveBeenCalled()
    expect(saveRulingsAction).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith(en.edit.invalid)
  })
})
