import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateLocalization = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/lib/localization-actions', () => ({ updateLocalization: (...a: unknown[]) => updateLocalization(...a) }))
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))

import { toast } from 'sonner'
import { LocalizationForm } from '../localization-form'
import en from '@/../messages/en.json'

function renderForm(kind: 'adventure' | 'match' | null = null) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <LocalizationForm
        cardId="x-1"
        lang="de"
        kind={kind}
        initial={{
          name: 'Alt', text: 'Rumpf', flavorText: '', status: 'machine',
          adventure: { effect: '', reward: '', toSolve: '' },
          match: { prize: '', toWin: '' },
        }}
      />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => updateLocalization.mockClear())

describe('LocalizationForm', () => {
  it('blocks an empty name and does not call the action', async () => {
    renderForm()
    await userEvent.clear(screen.getByLabelText(en.edit.name))
    await userEvent.click(screen.getByRole('button', { name: en.edit.save }))
    expect(toast.error).toHaveBeenCalledWith(en.edit.invalid)
    expect(updateLocalization).not.toHaveBeenCalled()
  })

  it('submits the edited fields', async () => {
    renderForm()
    const name = screen.getByLabelText(en.edit.name)
    await userEvent.clear(name)
    await userEvent.type(name, 'Neuer Name')
    await userEvent.click(screen.getByRole('button', { name: en.edit.save }))
    expect(updateLocalization).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: 'x-1', lang: 'de', name: 'Neuer Name', status: 'machine' }),
    )
  })

  it('keeps Save disabled until a field changes', async () => {
    renderForm()
    const save = screen.getByRole('button', { name: en.edit.save })
    expect(save).toBeDisabled()
    await userEvent.type(screen.getByLabelText(en.edit.name), 'x')
    expect(save).toBeEnabled()
  })

  it('shows the Adventure section only for adventure cards', () => {
    const { unmount } = renderForm(null)
    expect(screen.queryByLabelText(en.edit.effect)).not.toBeInTheDocument()
    unmount()
    renderForm('adventure')
    expect(screen.getByLabelText(en.edit.effect)).toBeInTheDocument()
    expect(screen.queryByLabelText(en.edit.prize)).not.toBeInTheDocument()
  })

  it('submits the adventure group', async () => {
    renderForm('adventure')
    await userEvent.type(screen.getByLabelText(en.edit.effect), 'boom')
    await userEvent.click(screen.getByRole('button', { name: en.edit.save }))
    expect(updateLocalization).toHaveBeenCalledWith(
      expect.objectContaining({ adventure: { effect: 'boom', reward: '', toSolve: '' } }),
    )
  })

  it('shows the Match section only for match cards', () => {
    renderForm('match')
    expect(screen.getByLabelText(en.edit.prize)).toBeInTheDocument()
    expect(screen.queryByLabelText(en.edit.effect)).not.toBeInTheDocument()
  })

  it('submits the match group', async () => {
    renderForm('match')
    await userEvent.type(screen.getByLabelText(en.edit.prize), 'win it')
    await userEvent.click(screen.getByRole('button', { name: en.edit.save }))
    expect(updateLocalization).toHaveBeenCalledWith(
      expect.objectContaining({ match: { prize: 'win it', toWin: '' } }),
    )
  })
})
