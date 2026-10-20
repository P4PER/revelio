import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const saveCardEditAction = vi.fn<(input: unknown) => Promise<{ ok: true }>>(async () => ({ ok: true }))
vi.mock('@/lib/actions/card-edit-actions', () => ({
  saveCardEditAction: (input: unknown) => saveCardEditAction(input),
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
  saveCardEditAction.mockClear()
  toastError.mockClear()
})

describe('CardEditForm', () => {
  it('saves the localization and the rulings in one action call', async () => {
    renderForm()
    await userEvent.click(screen.getByRole('button', { name: en.edit.save }))
    expect(saveCardEditAction).toHaveBeenCalledTimes(1)
    expect(saveCardEditAction).toHaveBeenCalledWith({
      cardId: 'x-1',
      lang: 'en',
      localization: { name: 'Card', text: '', flavorText: '', status: 'machine' },
      rulings: [],
    })
  })

  it('saves nothing while a ruling row is incomplete', async () => {
    renderForm()
    await userEvent.click(screen.getByRole('button', { name: en.edit.addRuling }))
    await userEvent.click(screen.getByRole('button', { name: en.edit.save }))
    expect(saveCardEditAction).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith(en.edit.invalid)
  })

  it('flags both sections at once and focuses the first invalid field', async () => {
    renderForm()
    const name = screen.getByLabelText(en.edit.name)
    await userEvent.clear(name)
    await userEvent.click(screen.getByRole('button', { name: en.edit.addRuling }))
    await userEvent.click(screen.getByRole('button', { name: en.edit.save }))
    expect(name).toHaveAttribute('aria-invalid', 'true')
    // The card's own Text field shares the label; the ruling's comes last.
    expect(screen.getAllByLabelText(en.edit.rulingText).at(-1)).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveFocus()
    expect(saveCardEditAction).not.toHaveBeenCalled()
  })

  it('reports a server-side rejection as a failed save, not a form error', async () => {
    saveCardEditAction.mockResolvedValueOnce({ ok: false, error: 'invalid' } as never)
    renderForm()
    await userEvent.click(screen.getByRole('button', { name: en.edit.save }))
    expect(toastError).toHaveBeenCalledWith(en.edit.saveFailed)
  })
})
