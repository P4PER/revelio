import { z } from 'zod'

const Env = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  // Set to register commands into one guild, which is instant. Unset registers
  // globally, which Discord can take up to an hour to propagate.
  DISCORD_GUILD_ID: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1),
  MEILI_HOST: z.string().url(),
  MEILI_SEARCH_KEY: z.string().default(''),
  IMAGE_BASE_URL: z.string().url(),
  SITE_BASE_URL: z.string().url(),
})

export type BotEnv = z.infer<typeof Env>

// Reports every problem at once and quotes only variable names, never values:
// this message is the first thing a container log shows, and DISCORD_TOKEN
// must never reach it.
export function parseEnv(source: Record<string, string | undefined> = process.env): BotEnv {
  const parsed = Env.safeParse(source)
  if (parsed.success) return parsed.data
  const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
  throw new Error(`Invalid bot environment:\n  ${problems.join('\n  ')}`)
}
