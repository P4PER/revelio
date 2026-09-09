import { REST, Routes } from 'discord.js'
import { parseEnv, type BotEnv } from '../env'
import { COMMANDS } from './commands/index'

// Guild-scoped registration is instant, which is what you want while iterating.
// Global registration can take up to an hour to propagate, so it is the
// production path only.
export async function registerCommands(env: BotEnv): Promise<number> {
  const body = [...COMMANDS.values()].map((c) => c.data.toJSON())
  const rest = new REST().setToken(env.DISCORD_TOKEN)
  const route = env.DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID)
    : Routes.applicationCommands(env.DISCORD_CLIENT_ID)
  await rest.put(route, { body })
  return body.length
}

const isMain = process.argv[1] === new URL(import.meta.url).pathname
if (isMain) {
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
}
