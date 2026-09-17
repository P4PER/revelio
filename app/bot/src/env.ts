import { z } from 'zod'

const Env = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  // Set to register commands into one guild, which is instant. Unset registers
  // globally, which Discord can take up to an hour to propagate. .env.example
  // ships this key blank, so an empty string is how "unset" actually reaches us
  // from the env file and must mean the same thing.
  DISCORD_GUILD_ID: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().min(1).optional(),
  ),
  DATABASE_URL: z.string().min(1),
  MEILI_HOST: z.string().url(),
  MEILI_SEARCH_KEY: z.string().default(''),
  IMAGE_BASE_URL: z.string().url(),
  // Where the bot's own renderer fetches card art from, as opposed to
  // IMAGE_BASE_URL, which goes into embed URLs that *Discord* fetches. In a
  // cluster these are different hosts: the public ingress is what Discord can
  // reach and often what the pod cannot (hairpin NAT), and the in-cluster
  // service name is the other way round. Blank is how "unset" reaches us from an
  // env file, and means "same host as IMAGE_BASE_URL" - which is every
  // single-host deployment.
  IMAGE_FETCH_BASE_URL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().url().optional(),
  ),
  SITE_BASE_URL: z.string().url(),
})

// IMAGE_FETCH_BASE_URL is always a string by the time a consumer sees it: the
// fallback to IMAGE_BASE_URL depends on a sibling field, so it is applied after
// the parse rather than in the schema.
export type BotEnv = Omit<z.infer<typeof Env>, 'IMAGE_FETCH_BASE_URL'> & { IMAGE_FETCH_BASE_URL: string }

// Reports every problem at once and quotes only variable names, never values:
// this message is the first thing a container log shows, and DISCORD_TOKEN
// must never reach it.
export function parseEnv(source: Record<string, string | undefined> = process.env): BotEnv {
  const parsed = Env.safeParse(source)
  if (parsed.success) {
    return { ...parsed.data, IMAGE_FETCH_BASE_URL: parsed.data.IMAGE_FETCH_BASE_URL ?? parsed.data.IMAGE_BASE_URL }
  }
  const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
  throw new Error(`Invalid bot environment:\n  ${problems.join('\n  ')}`)
}
