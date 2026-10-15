import { createRef } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateLocalization = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/lib/actions/localization-actions', () => ({ updateLocalization: (...a: unknown[]) => updateLocalization(...a) }))

import { LocalizationForm, type LocalizationFormHandle } from '@/components/card/localization-form'
import en from '@/../messages/en.json'

// Saved through the ref handle, the way CardEditForm, its only caller, saves it.
const handle = createRef<LocalizationFormHandle>()
const save = () => act(() => handle.current!.save())
const validate = () => act(() => handle.current!.validate(true))

function renderForm(kind: 'adventure' | 'match' | null = null) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <LocalizationForm
        ref={handle}
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
  it('fails validation on an empty name, shows the error and focuses the field', async () => {
    renderForm()
    const name = screen.getByLabelText(en.edit.name)
    await userEvent.clear(name)
    await userEvent.tab()
    expect(await validate()).toBe(false)
    expect(await screen.findByText(en.validation.required)).toBeInTheDocument()
    expect(name).toHaveFocus()
  })

  it('submits the edited fields', async () => {
    renderForm()
    const name = screen.getByLabelText(en.edit.name)
    await userEvent.clear(name)
    await userEvent.type(name, 'Neuer Name')
    await save()
    expect(updateLocalization).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: 'x-1', lang: 'de', name: 'Neuer Name', status: 'machine' }),
    )
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
    await save()
    expect(updateLocalization).toHaveBeenCalledWith(
      expect.objectContaining({ adventure: { effect: 'boom', reward: '', toSolve: '' } }),
    )
  })

  it('hides the generic Text field for adventure/match cards', () => {
    const { unmount } = renderForm(null)
    expect(screen.getByLabelText(en.edit.text)).toBeInTheDocument()
    unmount()
    renderForm('adventure')
    expect(screen.queryByLabelText(en.edit.text)).not.toBeInTheDocument()
  })

  it('shows the Match section only for match cards', () => {
    renderForm('match')
    expect(screen.getByLabelText(en.edit.prize)).toBeInTheDocument()
    expect(screen.queryByLabelText(en.edit.effect)).not.toBeInTheDocument()
  })

  it('submits the match group', async () => {
    renderForm('match')
    await userEvent.type(screen.getByLabelText(en.edit.prize), 'win it')
    await save()
    expect(updateLocalization).toHaveBeenCalledWith(
      expect.objectContaining({ match: { prize: 'win it', toWin: '' } }),
    )
  })
})
