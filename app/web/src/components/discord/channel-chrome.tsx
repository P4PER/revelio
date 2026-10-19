import { useTranslations } from 'next-intl'
import type { BotCommandName } from '@revelio/core'
import {
  DISCORD_ACTIVE,
  DISCORD_HEADING,
  DISCORD_INPUT,
  DISCORD_MENTION,
  DISCORD_MUTED,
  DISCORD_PILL_LIVE,
  DISCORD_RULE,
  DISCORD_TEXT,
} from '@/lib/discord-palette'

type MessageBoxProps = {
  // Command and option are the literal names the bot registers, not copy;
  // command-picker.test.tsx holds the option to the command's registered ones.
  command: BotCommandName
  option: string
  value: string
}

/*
 * The frame both Discord windows on /discord share: the channel header above
 * and the message box below. The hero's channel mock and the slash menu sit on
 * one page, so these are one component each rather than two lookalikes that
 * drift apart. Sized to the slash menu's metrics (14px base text, 16px window
 * padding); the window that hosts them sets the base size.
 */

export function ChannelHeader() {
  const t = useTranslations('discord')
  return (
    <div
      data-channel-header
      className="flex min-w-0 items-center gap-1.5 border-b px-4 py-2.5 text-[0.94rem] font-semibold"
      style={{ borderColor: DISCORD_RULE, color: DISCORD_MUTED }}
    >
      <span className="text-xl leading-none font-normal">#</span>
      <span className="shrink-0" style={{ color: DISCORD_HEADING }}>
        {t('channelName')}
      </span>
      <span className="ml-1 h-4 w-px shrink-0" style={{ background: DISCORD_ACTIVE }} />
      <span className="truncate pl-1.5 text-[0.82rem] font-normal">{t('channelTopic')}</span>
    </div>
  )
}

// Discord's message box mid-typing: a command, one option already picked and
// its value under way. Scenery, so hidden from assistive tech.
export function MessageBox({ command, option, value }: MessageBoxProps) {
  return (
    <div
      data-message-box
      aria-hidden
      className="mx-4 mt-2 mb-5 flex items-center gap-3 rounded-lg px-4 py-[11px] text-[0.94rem]"
      style={{ background: DISCORD_INPUT }}
    >
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-full font-bold leading-none"
        style={{ background: DISCORD_MUTED, color: DISCORD_INPUT }}
      >
        +
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span data-command>/{command}</span>
        <span
          data-option
          className="rounded px-1.5 font-mono text-[0.82rem] leading-[22px] after:content-[':']"
          style={{ background: DISCORD_PILL_LIVE, color: DISCORD_MENTION }}
        >
          {option}
        </span>
        <span className="truncate">{value}</span>
        {/* Discord's own caret, so the line reads as mid-typing rather than
            sent. globals.css owns the keyframes as --animate-caret-blink. */}
        <span
          data-caret
          className="inline-block h-[18px] w-[1.5px] shrink-0 animate-caret-blink motion-reduce:animate-none"
          style={{ background: DISCORD_TEXT }}
        />
      </span>
    </div>
  )
}
