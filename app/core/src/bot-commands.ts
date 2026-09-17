export type BotCommandName = 'card' | 'search' | 'deck' | 'collection' | 'mydecks'

/**
 * One option on one slash command, as Discord sees it.
 *
 * `choices` names an attribute scope rather than listing the values, so a
 * rendered reference table resolves them through attrLabel and stays correct
 * when a lesson or card type is added. `min` is Discord's min_value and only
 * applies to an integer option.
 */
export type CommandOptionSpec = {
  name: string
  type: 'string' | 'integer'
  required: boolean
  autocomplete: boolean
  choices?: 'lessons' | 'types'
  /**
   * A fixed list of values that belongs to the command rather than to the card
   * domain, such as how /deck answers. Kept apart from `choices` because there
   * is no attribute scope to resolve: the values are listed here, and their
   * labels come from the docs catalog under `choices.<option>.<value>`.
   */
  values?: readonly string[]
  min?: number
}

/**
 * The shape of one slash command: what a user can type and how the bot answers.
 *
 * Deliberately carries no descriptions. Discord's are terse and capped at 100
 * characters while the docs want prose, and a description is rewritten on
 * purpose rather than drifting by accident. What drifts silently is structure -
 * an option added, renamed, or made required - so structure is what lives here.
 *
 * Named BotCommandSpec, not BotCommand: bot/src/discord/commands/index.ts
 * already exports a BotCommand for the runtime shape (builder plus handlers).
 */
export type BotCommandSpec = {
  name: BotCommandName
  ephemeral: boolean
  linkRequired: boolean
  options: readonly CommandOptionSpec[]
}

// Mirrors bot/src/discord/commands/*.ts. bot/test/command-manifest.test.ts
// fails if the two ever disagree, so treat that test as the contract: change
// a builder and this array in the same commit.
export const BOT_COMMANDS: readonly BotCommandSpec[] = [
  {
    name: 'card',
    ephemeral: false,
    linkRequired: false,
    options: [{ name: 'name', type: 'string', required: true, autocomplete: true }],
  },
  {
    name: 'search',
    ephemeral: false,
    linkRequired: false,
    options: [
      { name: 'query', type: 'string', required: true, autocomplete: false },
      { name: 'lesson', type: 'string', required: false, autocomplete: false, choices: 'lessons' },
      { name: 'type', type: 'string', required: false, autocomplete: false, choices: 'types' },
      { name: 'set', type: 'string', required: false, autocomplete: true },
      { name: 'page', type: 'integer', required: false, autocomplete: false, min: 1 },
    ],
  },
  {
    name: 'deck',
    ephemeral: false,
    linkRequired: false,
    options: [
      { name: 'deck', type: 'string', required: true, autocomplete: false },
      { name: 'view', type: 'string', required: false, autocomplete: false, values: ['image', 'list'] },
    ],
  },
  {
    name: 'collection',
    ephemeral: true,
    linkRequired: true,
    options: [{ name: 'set', type: 'string', required: false, autocomplete: true }],
  },
  {
    name: 'mydecks',
    ephemeral: true,
    linkRequired: true,
    options: [],
  },
]
