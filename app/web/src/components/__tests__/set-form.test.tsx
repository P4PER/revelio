import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { SetForm } from '../set-form'

const push = vi.fn()
const refresh = vi.fn()
const create = vi.fn(async () => ({ ok: true }))
const update = vi.fn(async () => ({ ok: true }))
const upload = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/set-actions', () => ({
  createSetAction: (...a: unknown[]) => create(...a),
  updateSetAction: (...a: unknown[]) => update(...a),
  uploadSetSymbol: (...a: unknown[]) => upload(...a),
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

beforeEach(() => {
  push.mockReset(); refresh.mockReset(); create.mockClear(); update.mockClear()
  upload.mockClear()
  // jsdom has no object-URL support; the staged-symbol preview needs it
  ;(URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(() => 'blob:mock')
  ;(URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = vi.fn()
})

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
    expect(screen.queryByLabelText('Change symbol')).toBeNull()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Base Set' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('BS', expect.objectContaining({ name: 'Base Set' })))
  })

  it('create mode stages a symbol file and uploads it after the set is created', async () => {
    renderForm('create')
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'PROMO' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Promo' } })
    const fileInput = screen.getByLabelText('Change symbol') // aria-label = t('uploadSymbol')
    fireEvent.change(fileInput, { target: { files: [new File(['x'], 'promo.png', { type: 'image/png' })] } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(create).toHaveBeenCalled())
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1))
    const fd = upload.mock.calls[0][0] as FormData
    expect(fd.get('code')).toBe('PROMO')
    expect((fd.get('file') as File).name).toBe('promo.png')
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/sets'))
  })

  it('create mode without a symbol does not call uploadSetSymbol', async () => {
    renderForm('create')
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'NS' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'No Symbol' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(upload).not.toHaveBeenCalled()
  })
})
