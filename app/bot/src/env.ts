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
  // Public, absolute. Goes into embed image URLs, which *Discord* fetches from
  // the public internet. Nothing in this process fetches a card image itself,
  // so there is only one image base here and no second one to confuse it with.
  IMAGE_BASE_URL: z.string().url(),
  SITE_BASE_URL: z.string().url(),
  // The deck sheet render service. The bot draws no pictures itself: /deck posts
  // what this answers with, and falls back to the list embed when it does not.
  //
  // The scheme check is not redundant: zod's url() accepts any scheme, so a
  // value like "sheet:8080" - a hostname someone forgot to prefix - passes it,
  // and fetch then rejects it on every /deck, costing the picture with nothing
  // failing at boot to say why. Same check the service puts on its own base.
  SHEET_SERVICE_URL: z.string().url()
    .refine((v) => /^https?:$/.test(new URL(v).protocol), { message: 'must be an http(s) URL' }),
  SHEET_TOKEN: z.string().min(16),
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
