import { parseEnv } from './env'
import { createSheetServer, listen } from './server'

// No `process.argv[1] === fileURLToPath(import.meta.url)` guard: inside an
// esbuild bundle both sides are the bundle itself, so a guard here would fire
// for the one entry point that must always run. See bot/src/main.ts.
async function main(): Promise<void> {
  const env = parseEnv()
  const server = createSheetServer(env)
  await listen(server, env.PORT)
  console.log(`sheet: listening on ${env.PORT}`)

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      // Stops accepting and lets the render in flight finish into its socket.
      server.close(() => process.exit(0))
    })
  }
}

main().catch((err) => {
  console.error('sheet failed to start:', err instanceof Error ? err.message : err)
  process.exit(1)
})
