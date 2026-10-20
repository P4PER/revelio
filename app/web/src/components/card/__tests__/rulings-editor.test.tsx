import React from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect } from 'vitest'

import { RulingsEditor, type RulingsEditorHandle } from '@/components/card/rulings-editor'
import en from '@/../messages/en.json'

// Read through the ref handle, the way CardEditForm, its only caller, saves it.
const handle = React.createRef<RulingsEditorHandle>()
const values = () => handle.current!.values()
const validate = () => act(() => handle.current!.validate(false))

function renderEditor(initial: { id: string; date: string; source: string; text: string }[] = []) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <RulingsEditor ref={handle} initial={initial} />
    </NextIntlClientProvider>,
  )
}

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
    expect(values()).toEqual([{ id: 'x-1-r0', date: '2001-08-31', source: 'POJO', text: 'new' }])
  })

  it('fails validation on an incomplete row and shows its required errors', async () => {
    renderEditor()
    await userEvent.click(screen.getByRole('button', { name: en.edit.addRuling }))
    expect(await validate()).toBe(false)
    expect(await screen.findAllByText(en.validation.required)).not.toHaveLength(0)
  })
})
