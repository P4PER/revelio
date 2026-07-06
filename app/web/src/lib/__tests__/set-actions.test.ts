import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  requireRole: vi.fn(async () => ({ user: { role: 'editor' } })),
  getSetByCode: vi.fn(async () => ({ code: 'BS', cardCount: 0 })),
  setSymbolFile: vi.fn(async () => {}),
  put: vi.fn(async () => {}),
  del: vi.fn(async () => {}),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ requireRole: m.requireRole }))
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }))
vi.mock('@revelio/db', () => ({
  getSetByCode: m.getSetByCode, setSymbolFile: m.setSymbolFile,
  createSet: vi.fn(), updateSet: vi.fn(), deleteSet: vi.fn(),
}))
vi.mock('@/lib/s3', () => ({ getS3: () => ({}), putObject: m.put, deleteObject: m.del }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }))
vi.mock('sharp', () => ({
  default: () => ({ webp: () => ({ toBuffer: async () => Buffer.from('x') }) }),
}))

import { uploadSetSymbol, removeSetSymbol } from '../set-actions'

function form(file: File | null, code = 'BS') {
  const fd = new FormData()
  if (file) fd.append('file', file)
  fd.append('code', code)
  return fd
}

beforeEach(() => {
  Object.values(m).forEach((f) => 'mockReset' in f && f.mockReset())
  m.requireRole.mockResolvedValue({ user: { role: 'editor' } })
  m.getSetByCode.mockResolvedValue({ code: 'BS', cardCount: 0 })
})

describe('uploadSetSymbol', () => {
  it('rejects a non-image file', async () => {
    const res = await uploadSetSymbol(form(new File(['x'], 'a.txt', { type: 'text/plain' })))
    expect(res).toEqual({ ok: false, error: 'type' })
    expect(m.put).not.toHaveBeenCalled()
  })

  it('rejects a non-editor before writing', async () => {
    m.requireRole.mockRejectedValueOnce(new Error('Forbidden'))
    let caught: unknown
    await uploadSetSymbol(form(new File(['x'], 'a.png', { type: 'image/png' }))).catch((e) => { caught = e })
    expect((caught as Error)?.message).toBe('Forbidden')
    expect(m.put).not.toHaveBeenCalled()
  })

  it('writes the symbol to symbols/<code>.webp and stores the filename', async () => {
    const res = await uploadSetSymbol(form(new File(['x'], 'logo.png', { type: 'image/png' })))
    expect(res).toEqual({ ok: true })
    expect(m.put).toHaveBeenCalledTimes(1)
    expect(m.put.mock.calls[0][1]).toBe('symbols/BS.webp')
    expect(m.setSymbolFile).toHaveBeenCalledWith({}, 'BS', 'logo.png')
  })
})

describe('removeSetSymbol', () => {
  it('deletes the object and nulls the symbol', async () => {
    const res = await removeSetSymbol('BS')
    expect(res).toEqual({ ok: true })
    expect(m.del.mock.calls[0][1]).toBe('symbols/BS.webp')
    expect(m.setSymbolFile).toHaveBeenCalledWith({}, 'BS', null)
  })
})
