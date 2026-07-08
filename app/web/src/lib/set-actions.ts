'use server'
import sharp from 'sharp'
import { revalidatePath } from 'next/cache'
import { symbolKey } from '@revelio/core'
import { requireRole } from '@/lib/session'
import { getDb } from '@/lib/db'
import { getSetByCode, setSymbolFile, createSet, updateSet, deleteSet } from '@revelio/db'
import { getS3, putObject, deleteObject } from '@/lib/s3'
import { makeSetWriteSchema, makeSetCreateSchema } from '@/lib/schemas/set'

export type SetActionResult = { ok: true } | { ok: false; error: string }

const MAX_BYTES = 5 * 1024 * 1024

function revalidateSetSurfaces(code: string) {
  revalidatePath('/')
  revalidatePath('/sets')
  revalidatePath(`/sets/${code}`)
  revalidatePath('/search')
  revalidatePath('/admin/sets')
  revalidatePath(`/admin/sets/${code}/edit`)
}

export async function uploadSetSymbol(formData: FormData): Promise<SetActionResult> {
  await requireRole('editor')
  const code = String(formData.get('code') ?? '')
  const file = formData.get('file')
  if (!code || !(file instanceof File)) return { ok: false, error: 'invalid' }
  if (!file.type.startsWith('image/')) return { ok: false, error: 'type' }
  if (file.size > MAX_BYTES) return { ok: false, error: 'size' }

  const db = getDb()
  if (!(await getSetByCode(db, code))) return { ok: false, error: 'invalid' }

  const input = Buffer.from(await file.arrayBuffer())
  // No flatten: the symbol is rendered as a CSS mask, so its alpha channel must survive.
  const webp = await sharp(input).webp({ quality: 90 }).toBuffer()
  await putObject(getS3(), symbolKey(code), webp, 'image/webp')
  await setSymbolFile(db, code, file.name)

  revalidateSetSurfaces(code)
  return { ok: true }
}

export async function removeSetSymbol(code: string): Promise<SetActionResult> {
  await requireRole('editor')
  if (!code) return { ok: false, error: 'invalid' }
  const db = getDb()
  await deleteObject(getS3(), symbolKey(code))
  await setSymbolFile(db, code, null)
  revalidateSetSurfaces(code)
  return { ok: true }
}

// Shared with the client form (set-form.tsx) so the shape never drifts. The
// server discards validation messages, so the identity resolver is fine here.
const writeSchema = makeSetWriteSchema((k) => k)
const createSchema = makeSetCreateSchema((k) => k)

export async function createSetAction(input: unknown): Promise<SetActionResult> {
  await requireRole('editor')
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const { code, name, releaseDate, isOfficial, localizations } = parsed.data
  const db = getDb()
  if (await getSetByCode(db, code)) return { ok: false, error: 'exists' }
  await createSet(db, code, { name, releaseDate: releaseDate.trim() || null, isOfficial, localizations })
  revalidateSetSurfaces(code)
  return { ok: true }
}

export async function updateSetAction(code: string, input: unknown): Promise<SetActionResult> {
  await requireRole('editor')
  const parsed = writeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const { name, releaseDate, isOfficial, localizations } = parsed.data
  const db = getDb()
  if (!(await getSetByCode(db, code))) return { ok: false, error: 'invalid' }
  await updateSet(db, code, { name, releaseDate: releaseDate.trim() || null, isOfficial, localizations })
  revalidateSetSurfaces(code)
  return { ok: true }
}

export async function deleteSetAction(code: string): Promise<SetActionResult> {
  await requireRole('editor')
  const db = getDb()
  const set = await getSetByCode(db, code)
  if (!set) return { ok: false, error: 'invalid' }
  if (set.cardCount > 0) return { ok: false, error: 'has-cards' }
  await deleteObject(getS3(), symbolKey(code))
  await deleteSet(db, code)
  revalidateSetSurfaces(code)
  return { ok: true }
}
