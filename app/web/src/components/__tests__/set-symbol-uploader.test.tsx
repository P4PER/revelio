import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { SetSymbolUploader } from '../set-symbol-uploader'

const refresh = vi.fn()
const upload = vi.fn(async () => ({ ok: true }))
const remove = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/set-actions', () => ({
  uploadSetSymbol: (...a: unknown[]) => upload(...a),
  removeSetSymbol: (...a: unknown[]) => remove(...a),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ refresh }) }))

function renderIt(hasSymbol = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SetSymbolUploader code="BS" hasSymbol={hasSymbol} imageBase="http://img" />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => { refresh.mockReset(); upload.mockClear(); remove.mockClear() })

describe('SetSymbolUploader', () => {
  it('uploads a chosen file with the set code', async () => {
    renderIt(false)
    const input = screen.getByLabelText('Change symbol') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'logo.png', { type: 'image/png' })] } })
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1))
    const fd = upload.mock.calls[0][0] as FormData
    expect(fd.get('code')).toBe('BS')
    expect((fd.get('file') as File).name).toBe('logo.png')
  })

  it('shows remove only when a symbol exists', async () => {
    const { rerender } = renderIt(false)
    expect(screen.queryByRole('button', { name: 'Remove symbol' })).toBeNull()
    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <SetSymbolUploader code="BS" hasSymbol imageBase="http://img" />
      </NextIntlClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove symbol' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith('BS'))
  })
})
