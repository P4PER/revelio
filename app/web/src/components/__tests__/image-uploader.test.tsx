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

function renderUploader(imageSrc: string | null = null) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ImageUploader cardId="x-1" lang="de" imageSrc={imageSrc} fallbackLang="en" />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => { uploadCardImage.mockClear(); removeCardImage.mockClear() })

describe('ImageUploader', () => {
  it('uploads the chosen file', async () => {
    renderUploader(null)
    const file = new File(['x'], 'art.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText(en.edit.chooseFile), file)
    await userEvent.click(screen.getByRole('button', { name: en.edit.upload }))
    expect(uploadCardImage).toHaveBeenCalledTimes(1)
    const fd = uploadCardImage.mock.calls[0][0] as FormData
    expect(fd.get('cardId')).toBe('x-1')
    expect(fd.get('lang')).toBe('de')
    expect((fd.get('file') as File).name).toBe('art.png')
  })

  it('removes the image', async () => {
    renderUploader('https://img.test/cards/x-1.de.webp')
    await userEvent.click(screen.getByRole('button', { name: en.edit.removeImage }))
    expect(removeCardImage).toHaveBeenCalledWith('x-1', 'de')
  })
})
