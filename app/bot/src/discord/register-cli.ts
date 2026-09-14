import { parseEnv } from '../env'
import { registerCommands } from './register'

// Standalone command registration, published without starting the gateway:
// `npm run register -w @revelio/bot`. This lives in its own file rather than behind an
// argv guard in register.ts, because main.ts imports that module and esbuild inlines it
// into the bot bundle, where such a guard would fire and exit before main() runs.
const env = parseEnv()
registerCommands(env)
  .then((n) => {
    const scope = env.DISCORD_GUILD_ID ? `guild ${env.DISCORD_GUILD_ID}` : 'globally'
    console.log(`registered ${n} commands ${scope}`)
    process.exit(0)
  })
  .catch((err) => {
    console.error('command registration failed:', err)
    process.exit(1)
  })
