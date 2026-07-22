'use server'
import { revalidateTag } from 'next/cache'
import { requireRole } from '@/lib/session'
import { getDb } from '@/lib/db'
import { upsertSiteSettings } from '@revelio/db'
import { makeSiteSettingsSchema } from '@/lib/schemas/site-settings'
import { SITE_SETTINGS_TAG } from '@/lib/site-settings'

export type SiteSettingsActionResult = { ok: true } | { ok: false; error: string }

// Server-side validation only needs pass/fail; the client form supplies the copy.
const schema = makeSiteSettingsSchema((k) => k)

const nullify = (v: string): string | null => (v.trim() === '' ? null : v.trim())

export async function updateSiteSettings(input: unknown): Promise<SiteSettingsActionResult> {
  await requireRole('admin')
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const d = parsed.data
  await upsertSiteSettings(getDb(), {
    operatorName: nullify(d.operatorName),
    operatorAddress: nullify(d.operatorAddress),
    contactEmail: nullify(d.contactEmail),
    hostingProvider: nullify(d.hostingProvider),
    responsiblePerson: nullify(d.responsiblePerson),
    githubUrl: nullify(d.githubUrl),
  })
  // Next 16 requires a cache-life profile as the second arg; 'max' is the
  // documented drop-in for the old single-arg call — it purges the tag outright.
  revalidateTag(SITE_SETTINGS_TAG, 'max')
  return { ok: true }
}
