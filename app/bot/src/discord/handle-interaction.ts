import { MessageFlags, type Interaction } from 'discord.js'
import type { Deps } from '../clients'
import { COMMANDS } from './commands/index'
import { toRevelioLocale } from '../i18n/locale'
import { t } from '../i18n/t'

// The gateway's interactionCreate handler. Its own module, with no top-level
// side effects, so tests can import it: main.ts starts the bot on import.
export async function handleInteraction(interaction: Interaction, deps: Deps): Promise<void> {
  if (interaction.isAutocomplete()) {
    const command = COMMANDS.get(interaction.commandName)
    // Autocomplete has a 3 second budget and no defer, so failures are swallowed
    // inside the handler rather than routed through the reply-based error path
    // below, which does not apply to an autocomplete interaction. An unanswered
    // one leaves the client spinning until it times out, so a stale registration
    // or an option with no handler still gets an empty list.
    if (!command?.autocomplete) {
      await interaction.respond([]).catch(() => {})
      return
    }
    await command.autocomplete(interaction, deps)
    return
  }
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
    // The command may or may not have deferred before throwing. An answer it
    // already sent may carry buttons or a menu whose collector is gone with
    // the error, so they are stripped rather than left up, dead.
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content, components: [] }).catch(() => {})
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {})
    }
  }
}
