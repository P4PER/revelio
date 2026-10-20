import { createRef } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect } from 'vitest'

import { LocalizationForm, type LocalizationFormHandle } from '@/components/card/localization-form'
import en from '@/../messages/en.json'

// Read through the ref handle, the way CardEditForm, its only caller, saves it.
const handle = createRef<LocalizationFormHandle>()
const values = () => handle.current!.values()
const validate = () => act(() => handle.current!.validate(true))

function renderForm(kind: 'adventure' | 'match' | null = null) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <LocalizationForm
        ref={handle}
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
    expect(values()).toEqual({ name: 'Neuer Name', text: 'Rumpf', flavorText: '', status: 'machine' })
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
    expect(values()).toEqual(
      expect.objectContaining({ adventure: { effect: 'boom', reward: '', toSolve: '' } }),
    )
    expect('match' in values()).toBe(false)
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
    expect(values()).toEqual(
      expect.objectContaining({ match: { prize: 'win it', toWin: '' } }),
    )
  })
})
