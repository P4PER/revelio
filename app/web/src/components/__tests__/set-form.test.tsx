import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { SetForm } from '../set-form'

const push = vi.fn()
const refresh = vi.fn()
const create = vi.fn(async () => ({ ok: true }))
const update = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/set-actions', () => ({
  createSetAction: (...a: unknown[]) => create(...a),
  updateSetAction: (...a: unknown[]) => update(...a),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

function renderForm(mode: 'create' | 'edit', initial = {
  code: '', name: '', releaseDate: '', isOfficial: false, localizations: {} as Record<string, string>,
}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SetForm mode={mode} locales={['en', 'de']} initial={initial} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => { push.mockReset(); refresh.mockReset(); create.mockClear(); update.mockClear() })

describe('SetForm', () => {
  it('create mode submits code + fields and redirects to the list', async () => {
    renderForm('create')
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'NEW' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Set' } })
    fireEvent.change(screen.getByLabelText('DE'), { target: { value: 'Neu' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith({
      code: 'NEW', name: 'New Set', releaseDate: '', isOfficial: false, localizations: { en: '', de: 'Neu' },
    }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/sets'))
  })

  it('edit mode disables the code field and calls updateSetAction with the code', async () => {
    renderForm('edit', { code: 'BS', name: 'Base', releaseDate: '2001-08-01', isOfficial: true, localizations: { de: 'Grundset' } })
    expect(screen.getByLabelText('Code')).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Base Set' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('BS', expect.objectContaining({ name: 'Base Set' })))
  })
})
