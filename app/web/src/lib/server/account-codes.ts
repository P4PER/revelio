import 'server-only'
import { createHash, randomInt, randomUUID } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import { getDb } from '@/lib/server/db'
import { verification } from '@revelio/db'

const TTL_MS = 10 * 60 * 1000 // 10 minutes, matches the OTP email copy

const hash = (code: string) => createHash('sha256').update(code).digest('hex')

export const emailChangeId = (userId: string) => `settings-email-change:${userId}`
export const deleteId = (userId: string) => `settings-delete:${userId}`

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function matchStoredCode(code: string, storedValue: string): Record<string, string> | null {
  let parsed: { codeHash?: string } & Record<string, string>
  try {
    parsed = JSON.parse(storedValue)
  } catch {
    return null
  }
  if (!parsed.codeHash || parsed.codeHash !== hash(code)) return null
  const { codeHash: _drop, ...extra } = parsed
  return extra
}

/** Store a one-time code (hashed) plus optional extra fields under `identifier`,
 *  replacing any existing code for the same identifier. Expires in 10 minutes. */
export async function storeCode(
  identifier: string,
  code: string,
  extra: Record<string, string> = {},
): Promise<void> {
  const db = getDb()
  const value = JSON.stringify({ codeHash: hash(code), ...extra })
  const expiresAt = new Date(Date.now() + TTL_MS)
  await db.delete(verification).where(eq(verification.identifier, identifier))
  await db.insert(verification).values({ id: randomUUID(), identifier, value, expiresAt })
}

/** Verify and single-use consume a code. Returns the stored extra fields on a
 *  match (and deletes the row), or null if missing, expired, or wrong. */
export async function consumeCode(identifier: string, code: string): Promise<Record<string, string> | null> {
  const db = getDb()
  const [row] = await db
    .select()
    .from(verification)
    .where(and(eq(verification.identifier, identifier), gt(verification.expiresAt, new Date())))
    .limit(1)
  if (!row) return null
  const extra = matchStoredCode(code, row.value)
  if (!extra) return null
  await db.delete(verification).where(eq(verification.identifier, identifier))
  return extra
}
