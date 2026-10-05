import { z } from 'zod'

const Env = z.object({
  // The platform injects a port on most hosts; 8080 is the fallback for a bare
  // container run and for the local compose stack.
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  // Where this process GETs card art. One meaning, unlike the bot's two bases:
  // nothing here ever hands a URL to Discord, so there is nothing to split.
  // In a cluster this is the object store's internal service name.
  //
  // The scheme check is not redundant: zod's url() accepts any scheme, so a
  // value like "rustfs:9000" - a hostname someone forgot to prefix - passes it
  // and then fails on the first fetch instead of at boot.
  IMAGE_BASE_URL: z.string().url()
    .refine((v) => /^https?:$/.test(new URL(v).protocol), { message: 'must be an http(s) URL' })
    // A query or fragment on the base would survive into every art URL, where
    // the key is appended after it - so every card would resolve to the same
    // wrong path and the sheet would come back all placeholders, with nothing
    // failing at boot to say why.
    .refine((v) => { const u = new URL(v); return u.search === '' && u.hash === '' },
      { message: 'must have no query or fragment' }),
  // Shared bearer token. The service has no public ingress; this is depth
  // behind that, and it is what keeps any pod on the network from spending the
  // render queue.
  SHEET_TOKEN: z.string().min(16),
})

export type SheetEnv = z.infer<typeof Env>

// Reports every problem at once and quotes only variable names, never values -
// this message is the first thing a container log shows.
export function parseEnv(source: Record<string, string | undefined> = process.env): SheetEnv {
  const parsed = Env.safeParse(source)
  if (parsed.success) return parsed.data
  const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
  throw new Error(`Invalid sheet environment:\n  ${problems.join('\n  ')}`)
}
