import type { CSSProperties } from 'react'
import { Lock, Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { BOT_COMMANDS, type BotCommandName, type BotCommandSpec } from '@revelio/core'
import { BotAvatar } from '@/components/discord/bot-avatar'
import {
  DISCORD_ACTIVE,
  DISCORD_BLURPLE,
  DISCORD_CHANNEL,
  DISCORD_EMBED,
  DISCORD_HEADING,
  DISCORD_INPUT,
  DISCORD_MENTION,
  DISCORD_MUTED,
  DISCORD_PILL,
  DISCORD_PILL_BORDER,
  DISCORD_RULE,
  DISCORD_SELECT,
  DISCORD_TEXT,
} from '@/lib/discord-palette'

type HistoryMessage = { initial: string; color: string; name: string; time: string; key: 'history1' | 'history2' }

// Display order only - most-used first. Everything else about a command (its
// options, whether it answers in the channel) comes from BOT_COMMANDS,
// which bot/test/command-manifest.test.ts holds to what the bot registers. The
// grid used to keep its own copy and kept showing an option the bot had dropped.
//
// Option names are data, not copy: they are the literal option names the bot
// registers with Discord, identical in every language, so a visitor types the
// same thing either way.
const ORDER: readonly BotCommandName[] = ['card', 'search', 'deck', 'decks', 'collection', 'mydecks']

const COMMANDS: readonly BotCommandSpec[] = ORDER.flatMap((name) => BOT_COMMANDS.filter((c) => c.name === name))

// Usernames are data, not copy: they read the same in both catalogs.
const HISTORY: readonly HistoryMessage[] = [
  { initial: 'N', color: '#3ba55d', name: 'nevillefan', time: '21:02', key: 'history1' },
  { initial: 'L', color: '#eb459e', name: 'luna.l', time: '21:03', key: 'history2' },
]

// An option as Discord's menu shows it: a tinted pill ending in a muted colon.
function OptionPill({ name }: { name: string }) {
  return (
    <code
      className="rounded border px-1.5 py-px font-mono text-[0.72rem] whitespace-nowrap after:text-(--colon) after:content-[':']"
      // The colon is a pseudo-element so it stays out of the pill's text; the
      // custom property is how a palette constant reaches it.
      style={
        {
          background: DISCORD_PILL,
          borderColor: DISCORD_PILL_BORDER,
          color: DISCORD_MENTION,
          '--colon': DISCORD_MUTED,
        } as CSSProperties
      }
    >
      {name}
    </code>
  )
}

function CommandRow({ command, selected }: { command: BotCommandSpec; selected: boolean }) {
  const t = useTranslations('discord')
  const Icon = command.ephemeral ? Lock : Users
  return (
    <li
      className="flex items-center gap-3 rounded px-2 py-1.5"
      style={selected ? { background: DISCORD_ACTIVE } : undefined}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[0.84rem] font-bold" style={{ color: DISCORD_HEADING }}>
            /{command.name}
          </span>
          {command.options.length > 0 ? (
            command.options.map((option) => <OptionPill key={option.name} name={option.name} />)
          ) : (
            <span className="text-[0.72rem] italic" style={{ color: DISCORD_MUTED }}>
              {t('picker.noOptions')}
            </span>
          )}
        </div>
        <p className="text-[0.74rem] leading-snug" style={{ color: DISCORD_MUTED }}>
          {t(`commands.${command.name}.description`)}
        </p>
      </div>
      {/* Who sees the answer. The icon stays at every width; the word goes on a
          phone, where it would squeeze the description. */}
      <span
        className="flex shrink-0 items-center gap-1 text-[0.7rem] font-medium"
        style={{ color: command.ephemeral ? DISCORD_MUTED : DISCORD_MENTION }}
      >
        <Icon className="size-3.5" aria-hidden />
        <span className="sr-only sm:not-sr-only">
          {t(command.ephemeral ? 'picker.onlyYou' : 'picker.channel')}
        </span>
      </span>
    </li>
  )
}

/*
 * Discord's slash-command menu, open over a channel, listing what the bot
 * registers. Like command-channel.tsx it is hand-built markup that depicts
 * Discord, so it draws only from lib/discord-palette.ts and stays dark in
 * the light theme. The channel history and the message box are scenery and
 * hidden from assistive tech; the menu itself is the content.
 */
export function CommandPicker() {
  const t = useTranslations('discord')
  return (
    <div
      role="group"
      aria-label={t('picker.label')}
      className="overflow-hidden rounded-xl text-left text-[0.84rem] shadow-2xl"
      style={{ background: DISCORD_CHANNEL, color: DISCORD_TEXT }}
    >
      <div
        className="flex min-w-0 items-center gap-1.5 border-b px-3.5 py-2 text-[0.78rem] font-semibold"
        style={{ borderColor: DISCORD_RULE, color: DISCORD_MUTED }}
      >
        <span className="text-base leading-none">#</span>
        <span className="shrink-0" style={{ color: DISCORD_HEADING }}>
          {t('channelName')}
        </span>
        <span className="mx-1.5 h-4 w-px shrink-0" style={{ background: DISCORD_RULE }} />
        <span className="truncate font-normal">{t('picker.topic')}</span>
      </div>

      <div
        aria-hidden
        className="hidden flex-col gap-3 px-3.5 pt-4 [mask-image:linear-gradient(to_bottom,transparent,black_60%)] sm:flex"
      >
        {HISTORY.map((m) => (
          <div key={m.key} className="flex gap-3">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ background: m.color }}
            >
              {m.initial}
            </span>
            <div className="min-w-0">
              <span className="text-sm font-semibold" style={{ color: DISCORD_HEADING }}>
                {m.name}
              </span>{' '}
              <span className="text-[0.68rem]" style={{ color: DISCORD_MUTED }}>
                {m.time}
              </span>
              <p>{t(`picker.${m.key}`)}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="px-3.5 pt-3">
        <div className="flex overflow-hidden rounded-lg" style={{ background: DISCORD_EMBED }}>
          {/* The app rail: Revelio picked, two other apps faded out. */}
          <div
            aria-hidden
            className="hidden w-12 shrink-0 flex-col items-center gap-2 py-2.5 sm:flex"
            style={{ background: DISCORD_SELECT }}
          >
            <span className="rounded-full" style={{ boxShadow: `0 0 0 2px ${DISCORD_BLURPLE}` }}>
              <BotAvatar />
            </span>
            <span className="size-8 rounded-full opacity-40" style={{ background: DISCORD_ACTIVE }} />
            <span className="size-8 rounded-full opacity-40" style={{ background: DISCORD_ACTIVE }} />
          </div>
          <div className="min-w-0 flex-1 p-2">
            <div
              className="flex items-center gap-1.5 px-2 pb-1.5 text-[0.68rem] font-semibold tracking-wide uppercase"
              style={{ color: DISCORD_MUTED }}
            >
              <BotAvatar className="size-4" />
              {t('botName')}
            </div>
            <ul className="flex flex-col gap-0.5">
              {COMMANDS.map((command, i) => (
                <CommandRow key={command.name} command={command} selected={i === 0} />
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div
        aria-hidden
        className="m-3.5 mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-[0.82rem]"
        style={{ background: DISCORD_INPUT }}
      >
        <span
          className="flex size-5 shrink-0 items-center justify-center rounded-full text-sm leading-none"
          style={{ background: DISCORD_MUTED, color: DISCORD_INPUT }}
        >
          +
        </span>
        <span style={{ color: DISCORD_HEADING }}>/card</span>
        <span
          className="rounded border px-1.5 py-px font-mono text-[0.72rem]"
          style={{ background: DISCORD_PILL, borderColor: DISCORD_PILL_BORDER, color: DISCORD_MENTION }}
        >
          name
        </span>
        <span className="truncate">{t('sample.cardName')}</span>
        {/* globals.css owns the keyframes as --animate-caret-blink. */}
        <span
          data-caret
          className="-ml-1.5 inline-block h-4 w-px shrink-0 animate-caret-blink motion-reduce:animate-none"
          style={{ background: DISCORD_TEXT }}
        />
      </div>
    </div>
  )
}
