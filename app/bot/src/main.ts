import { Client, GatewayIntentBits, MessageFlags, type Interaction } from 'discord.js'
import { parseEnv } from './env'
import { createDeps, type Deps } from './clients'
import { COMMANDS } from './discord/commands/index'
import { registerCommands } from './discord/register'
import { toRevelioLocale } from './i18n/locale'
import { t } from './i18n/t'

async function handle(interaction: Interaction, deps: Deps): Promise<void> {
  if (!interaction.isChatInputCommand()) return
  const command = COMMANDS.get(interaction.commandName)
  if (!command) {
    // A stale registration still dispatches a removed name. Leaving the
    // interaction unacknowledged shows the user "the application did not
    // respond", which reads as the bot being down.
    console.warn(`unknown command ${interaction.commandName} (${interaction.id})`)
    await interaction
      .reply({ content: t(toRevelioLocale(interaction.locale), 'error.generic'),
               flags: MessageFlags.Ephemeral })
      .catch(() => {})
    return
  }
  try {
    await command.execute(interaction, deps)
  } catch (err) {
    // Log the command and interaction id, never the token or the raw options.
    console.error(`command ${interaction.commandName} failed (${interaction.id}):`, err)
    const content = t(toRevelioLocale(interaction.locale), 'error.generic')
    // The command may or may not have deferred before throwing.
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content }).catch(() => {})
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {})
    }
  }
}

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
  client.on('interactionCreate', (i) => { void handle(i, deps) })

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
