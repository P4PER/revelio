import React from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const saveRulingsAction = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/lib/actions/rulings-actions', () => ({ saveRulingsAction: (...a: unknown[]) => saveRulingsAction(...a) }))

import { RulingsEditor, type RulingsEditorHandle } from '@/components/card/rulings-editor'
import en from '@/../messages/en.json'

// Saved through the ref handle, the way CardEditForm, its only caller, saves it.
const handle = React.createRef<RulingsEditorHandle>()
const save = () => act(() => handle.current!.save())
const validate = () => act(() => handle.current!.validate(false))

function renderEditor(initial: { id: string; date: string; source: string; text: string }[] = []) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <RulingsEditor ref={handle} cardId="x-1" lang="en" initial={initial} />
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
    await save()
    expect(saveRulingsAction).toHaveBeenCalledWith({
      cardId: 'x-1',
      lang: 'en',
      rulings: [{ id: 'x-1-r0', date: '2001-08-31', source: 'POJO', text: 'new' }],
    })
  })

  it('fails validation on an incomplete row and shows its required errors', async () => {
    renderEditor()
    await userEvent.click(screen.getByRole('button', { name: en.edit.addRuling }))
    expect(await validate()).toBe(false)
    expect(await screen.findAllByText(en.validation.required)).not.toHaveLength(0)
  })
})
