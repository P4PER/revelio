'use server'
import { updateTag } from 'next/cache'
import { requireRole } from '@/lib/session'
import { getDb } from '@/lib/db'
import { upsertSiteSettings } from '@revelio/db'
import { makeSiteSettingsSchema } from '@/lib/schemas/site-settings'
import { SITE_SETTINGS_TAG } from '@/lib/site-settings'

export type SiteSettingsActionResult = { ok: true } | { ok: false; error: string }

// Server-side validation only needs pass/fail; the client form supplies the copy.
const schema = makeSiteSettingsSchema((k) => k)

// Schema fields are already `.trim()`-ed, so values arrive trimmed here.
const nullify = (v: string): string | null => (v === '' ? null : v)

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
  // updateTag (Server-Action-only) purges the tag AND marks the path revalidated,
  // giving read-your-own-writes: the footer/legal pages reflect the save on the
  // next render. revalidateTag(tag, 'max') would only stale-while-revalidate,
  // so the change wouldn't show until a later background refresh won the race.
  updateTag(SITE_SETTINGS_TAG)
  return { ok: true }
}
