import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const uploadCardImage = vi.fn(async () => ({ ok: true as const }))
const removeCardImage = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/lib/image-actions', () => ({
  uploadCardImage: (...a: unknown[]) => uploadCardImage(...a),
  removeCardImage: (...a: unknown[]) => removeCardImage(...a),
}))
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import { ImageUploader } from '../image-uploader'
import en from '@/../messages/en.json'

function renderUploader(imageSrc: string | null = null, fallbackLang: string | null = 'en') {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ImageUploader cardId="x-1" lang="de" imageSrc={imageSrc} fallbackLang={fallbackLang} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => { uploadCardImage.mockClear(); removeCardImage.mockClear() })

describe('ImageUploader', () => {
  it('uploads immediately when a file is chosen', async () => {
    const { container } = renderUploader(null)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'art.png', { type: 'image/png' })
    await userEvent.upload(input, file)
    expect(uploadCardImage).toHaveBeenCalledTimes(1)
    const fd = uploadCardImage.mock.calls[0][0] as FormData
    expect(fd.get('cardId')).toBe('x-1')
    expect(fd.get('lang')).toBe('de')
    expect((fd.get('file') as File).name).toBe('art.png')
  })

  it('shows the remove button only for the language’s own image and removes it', async () => {
    // fallback image (not own) -> no remove button
    const { unmount } = renderUploader('https://img.test/cards/x-1.webp', 'en')
    expect(screen.queryByRole('button', { name: en.edit.removeImage })).not.toBeInTheDocument()
    unmount()
    // own image (no fallback) -> remove button present
    renderUploader('https://img.test/cards/x-1.de.webp', null)
    await userEvent.click(screen.getByRole('button', { name: en.edit.removeImage }))
    expect(removeCardImage).toHaveBeenCalledWith('x-1', 'de')
  })
})
