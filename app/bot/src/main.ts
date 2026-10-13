import { Client, GatewayIntentBits } from 'discord.js'
import { parseEnv } from './env'
import { createDeps } from './clients'
import { handleInteraction } from './discord/handle-interaction'
import { registerCommands } from './discord/register'

async function main(): Promise<void> {
  const env = parseEnv()
  const { deps, close } = createDeps(env)

  // Guilds only. Reading message content or member lists would need privileged
  // intents and Discord verification; slash commands need neither.
  // allowedMentions is the blanket default for every reply: commands echo user
  // input back, and none of it should ever resolve into a ping.
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    allowedMentions: { parse: [] },
  })

  client.once('clientReady', (c) => console.log(`logged in as ${c.user.tag}`))
  client.on('interactionCreate', (i) => { void handleInteraction(i, deps) })

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down`)
    await client.destroy()
    await close()
    process.exit(0)
  }
  process.on('SIGTERM', () => { void shutdown('SIGTERM') })
  process.on('SIGINT', () => { void shutdown('SIGINT') })

  // Registering on every boot keeps the published set matching the deployed
  // code (Discord's PUT is a full replace). It must not be fatal, though: with
  // `restart: unless-stopped`, exiting here turns a transient 5xx into a crash
  // loop that burns the 200/day global-command rate limit. Previously
  // registered commands keep working, so log and carry on.
  try {
    const n = await registerCommands(env)
    console.log(`registered ${n} commands`)
  } catch (err) {
    console.error('command registration failed, continuing with the existing set:', err)
  }
  await client.login(env.DISCORD_TOKEN)
}

main().catch((err) => {
  console.error('bot failed to start:', err)
  process.exit(1)
})
