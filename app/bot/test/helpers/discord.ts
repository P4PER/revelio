import { vi } from 'vitest'
import { MessageFlags } from 'discord.js'
import { stubMeili } from './meili'

export type ClickOptions = {
  values?: string[]
  ephemeral?: boolean
  inGuild?: boolean
  allowed?: boolean
  locale?: string
}

// A button or select click as discord.js hands it over. deferUpdate/deferReply
// flip `deferred` the way discord.js does, so the router's error path sees the
// same state it would in production.
export function fakeClick(customId: string, opts: ClickOptions = {}) {
  const click = {
    id: 'click-1',
    customId,
    values: opts.values ?? [],
    locale: opts.locale ?? 'en',
    user: { id: '111' },
    deferred: false,
    replied: false,
    inGuild: () => opts.inGuild ?? true,
    isAutocomplete: () => false,
    isMessageComponent: () => true,
    isChatInputCommand: () => false,
    isStringSelectMenu: () => opts.values !== undefined,
    message: { flags: { has: (flag: number) => flag === MessageFlags.Ephemeral && (opts.ephemeral ?? true) } },
    channel: {
      isSendable: () => true,
      isThread: () => false,
      send: vi.fn().mockResolvedValue(undefined),
      sendTyping: vi.fn().mockResolvedValue(undefined),
    },
    appPermissions: { has: vi.fn(() => opts.allowed ?? true) },
    update: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    deferUpdate: vi.fn(async () => { click.deferred = true }),
    deferReply: vi.fn(async () => { click.deferred = true }),
    showModal: vi.fn().mockResolvedValue(undefined),
  }
  return click
}

export function fakeDeps(hits: unknown[], total: number) {
  const meili = stubMeili(hits, total)
  return {
    meili: meili.client,
    search: meili.search,
    db: {},
    sets: {
      name: vi.fn().mockResolvedValue('Base Set'),
      all: vi.fn().mockResolvedValue([{ code: 'base', name: 'Base Set' }, { code: 'coc', name: 'Chamber of Secrets' }]),
    },
    env: {
      IMAGE_BASE_URL: 'https://img.test',
      SITE_BASE_URL: 'https://revelio.cards',
      SHEET_SERVICE_URL: 'http://sheet:8080',
      SHEET_TOKEN: 'a-token-at-least-16-chars',
    },
  }
}

// A modal's submit, as discord.js hands it over: the text inputs come back
// through `fields`, keyed by their custom id.
export function fakeModalSubmit(customId: string, values: Record<string, string>, opts: ClickOptions = {}) {
  const submit = {
    id: 'submit-1',
    customId,
    locale: opts.locale ?? 'en',
    user: { id: '111' },
    deferred: false,
    replied: false,
    inGuild: () => opts.inGuild ?? true,
    isAutocomplete: () => false,
    isMessageComponent: () => false,
    isModalSubmit: () => true,
    isChatInputCommand: () => false,
    fields: { getTextInputValue: (key: string) => values[key] ?? '' },
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    deferUpdate: vi.fn(async () => { submit.deferred = true }),
  }
  return submit
}
