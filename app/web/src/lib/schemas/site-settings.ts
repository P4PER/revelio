import { z } from 'zod'

type T = (key: string) => string

const isEmail = (v: string) => v === '' || z.string().email().safeParse(v).success

// Only http(s) URLs — reject javascript:/data:/etc. so a saved githubUrl can be
// rendered as an href without becoming a script-injection vector.
const isUrl = (v: string) => {
  if (v === '') return true
  try {
    const { protocol } = new URL(v)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export function makeSiteSettingsSchema(t: T) {
  return z.object({
    operatorName: z.string().trim().max(200),
    operatorAddress: z.string().trim().max(1000),
    contactEmail: z.string().trim().max(320).refine(isEmail, t('email')),
    hostingProvider: z.string().trim().max(200),
    responsiblePerson: z.string().trim().max(200),
    githubUrl: z.string().trim().max(500).refine(isUrl, t('url')),
  })
}

export type SiteSettingsFormValues = z.infer<ReturnType<typeof makeSiteSettingsSchema>>
