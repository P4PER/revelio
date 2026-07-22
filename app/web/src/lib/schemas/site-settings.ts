import { z } from 'zod'

type T = (key: string) => string

const isEmail = (v: string) => v === '' || z.string().email().safeParse(v).success
const isUrl = (v: string) => v === '' || z.string().url().safeParse(v).success

export function makeSiteSettingsSchema(t: T) {
  return z.object({
    operatorName: z.string().trim().max(200),
    operatorAddress: z.string().trim().max(1000),
    contactEmail: z.string().trim().refine(isEmail, t('email')),
    hostingProvider: z.string().trim().max(200),
    responsiblePerson: z.string().trim().max(200),
    githubUrl: z.string().trim().refine(isUrl, t('url')),
  })
}

export type SiteSettingsFormValues = z.infer<ReturnType<typeof makeSiteSettingsSchema>>
