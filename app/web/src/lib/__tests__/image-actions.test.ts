import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  requireRole: vi.fn(async () => ({ user: { role: 'editor' } })),
  getCardById: vi.fn(async () => ({ id: 'x-1', defaultLanguage: 'en' })),
  setLocalizationImage: vi.fn(async () => {}),
  getCardIndexData: vi.fn(async () => null),
  reindexCard: vi.fn(async () => {}),
  getWriteClient: vi.fn(() => ({})),
  put: vi.fn(async () => {}),
  del: vi.fn(async () => {}),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ requireRole: m.requireRole }))
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }))
vi.mock('@revelio/db', () => ({
  getCardById: m.getCardById, setLocalizationImage: m.setLocalizationImage, getCardIndexData: m.getCardIndexData,
}))
vi.mock('@revelio/search', () => ({ reindexCard: m.reindexCard }))
vi.mock('@/lib/reindex', () => ({ getWriteClient: m.getWriteClient }))
vi.mock('@/lib/s3', () => ({ getS3: () => ({}), putObject: m.put, deleteObject: m.del }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }))
vi.mock('sharp', () => ({
  default: () => ({ webp: () => ({ resize: () => ({ toBuffer: async () => Buffer.from('x') }), toBuffer: async () => Buffer.from('x') }) }),
}))

import { uploadCardImage, removeCardImage } from '../image-actions'

function form(file: File | null, cardId = 'x-1', lang = 'de') {
  const fd = new FormData()
  if (file) fd.append('file', file)
  fd.append('cardId', cardId)
  fd.append('lang', lang)
  return fd
}

beforeEach(() => Object.values(m).forEach((f) => 'mockReset' in f && f.mockReset()))
beforeEach(() => {
  m.requireRole.mockResolvedValue({ user: { role: 'editor' } })
  m.getCardById.mockResolvedValue({ id: 'x-1', defaultLanguage: 'en' })
})

describe('uploadCardImage', () => {
  it('rejects a non-image file', async () => {
    const res = await uploadCardImage(form(new File(['x'], 'a.txt', { type: 'text/plain' })))
    expect(res).toEqual({ ok: false, error: 'type' })
    expect(m.put).not.toHaveBeenCalled()
  })

  it('rejects a non-editor before writing', async () => {
    m.requireRole.mockRejectedValueOnce(new Error('Forbidden'))
    let caught: unknown
    await uploadCardImage(form(new File(['x'], 'a.png', { type: 'image/png' }))).catch((e) => { caught = e })
    expect((caught as Error)?.message).toBe('Forbidden')
    expect(m.put).not.toHaveBeenCalled()
  })

  it('processes a valid image: writes full+thumb to the de keys and sets image_file', async () => {
    const res = await uploadCardImage(form(new File(['x'], 'art.png', { type: 'image/png' })))
    expect(res).toEqual({ ok: true })
    expect(m.put).toHaveBeenCalledTimes(2)
    const keys = m.put.mock.calls.map((c) => c[1])
    expect(keys).toContain('cards/x-1.de.webp')
    expect(keys).toContain('cards/thumb/x-1.de.webp')
    expect(m.setLocalizationImage).toHaveBeenCalledWith({}, 'x-1', 'de', 'art.png')
  })
})

describe('removeCardImage', () => {
  it('deletes both keys and nulls image_file', async () => {
    const res = await removeCardImage('x-1', 'de')
    expect(res).toEqual({ ok: true })
    expect(m.del).toHaveBeenCalledTimes(2)
    expect(m.setLocalizationImage).toHaveBeenCalledWith({}, 'x-1', 'de', null)
  })
})
