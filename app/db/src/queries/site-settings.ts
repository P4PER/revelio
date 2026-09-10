import { eq } from 'drizzle-orm'
import type { DB } from '../client'
import { siteSettings } from '../schema'

export type SiteSettings = typeof siteSettings.$inferSelect

export type SiteSettingsInput = {
  operatorName: string | null
  operatorAddress: string | null
  contactEmail: string | null
  hostingProvider: string | null
  responsiblePerson: string | null
  githubUrl: string | null
}

const SITE_SETTINGS_ID = 'singleton'

export async function getSiteSettings(db: DB): Promise<SiteSettings | null> {
  const rows = await db
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.id, SITE_SETTINGS_ID))
    .limit(1)
  return rows[0] ?? null
}

export async function upsertSiteSettings(db: DB, values: SiteSettingsInput): Promise<void> {
  await db
    .insert(siteSettings)
    .values({ id: SITE_SETTINGS_ID, ...values, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: siteSettings.id,
      set: { ...values, updatedAt: new Date() },
    })
}
