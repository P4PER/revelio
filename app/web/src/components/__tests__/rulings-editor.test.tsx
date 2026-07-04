import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const saveRulingsAction = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/lib/rulings-actions', () => ({ saveRulingsAction: (...a: unknown[]) => saveRulingsAction(...a) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))

import { RulingsEditor } from '../rulings-editor'
import en from '@/../messages/en.json'

function renderEditor(initial: { id: string; date: string; source: string; text: string }[] = []) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <RulingsEditor cardId="x-1" lang="en" initial={initial} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => saveRulingsAction.mockClear())

describe('RulingsEditor', () => {
  it('adds and removes a ruling row', async () => {
    renderEditor()
    expect(screen.queryByLabelText(en.edit.rulingText)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: en.edit.addRuling }))
    expect(screen.getByLabelText(en.edit.rulingText)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: en.edit.removeRuling }))
    expect(screen.queryByLabelText(en.edit.rulingText)).not.toBeInTheDocument()
  })

  it('submits rows with their ids and the active-language text', async () => {
    renderEditor([{ id: 'x-1-r0', date: '2001-08-31', source: 'POJO', text: 'old' }])
    const textField = screen.getByLabelText(en.edit.rulingText)
    await userEvent.clear(textField)
    await userEvent.type(textField, 'new')
    await userEvent.click(screen.getByRole('button', { name: en.edit.saveRulings }))
    expect(saveRulingsAction).toHaveBeenCalledWith({
      cardId: 'x-1',
      lang: 'en',
      rulings: [{ id: 'x-1-r0', date: '2001-08-31', source: 'POJO', text: 'new' }],
    })
  })
})
