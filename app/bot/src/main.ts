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
  if (!command) return
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
  const client = new Client({ intents: [GatewayIntentBits.Guilds] })

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

  const n = await registerCommands(env)
  console.log(`registered ${n} commands`)
  await client.login(env.DISCORD_TOKEN)
}

main().catch((err) => {
  console.error('bot failed to start:', err)
  process.exit(1)
})
