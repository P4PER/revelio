import Image from 'next/image'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  DISCORD_BLURPLE,
  DISCORD_CHANNEL,
  DISCORD_EMBED,
  DISCORD_HEADING,
  DISCORD_MENTION,
  DISCORD_MUTED,
  DISCORD_SELECT,
  DISCORD_TEXT,
  LESSON_CHARMS,
} from '@/lib/discord-palette'
import { BotAvatar } from '@/components/discord/bot-avatar'
import { ChannelHeader, MessageBox } from '@/components/discord/channel-chrome'

type ShareRow = { name: string; setCode: string; number: string; cost: number; thumb: string }

/*
 * A hand-built rendering of what bot/src/discord/v2/card-view.ts and
 * share-view.ts actually produce. It is markup rather than a screenshot so it
 * stays sharp at any width, works in both locales and costs a few small images
 * instead of a large one. The trade is that it is only as true as this comment
 * keeps it. When those builders change, change this:
 *   - every message is one container; its accent bar is the LESSON colour for a
 *     card (Charms is #0069A9) and BRAND_GOLD (#d4a83a) for a shared list
 *   - the card is: "## name", then two lines of labelled pairs (type and
 *     lesson; cost, rarity and legality), the image, the rules text and the
 *     flavour text in italics, the footer
 *     line "{setName} · #{number}" in small muted text, a link button
 *   - a shared list is a plain channel message, so it has no "used /search"
 *     line; it opens with "@user shared N cards from a search for ...", then one
 *     row per card ("**name** · set #number", then type, lesson and cost) with
 *     its thumbnail on the right, a "View a card" menu and a link button
 *   - both link buttons are left off here: the visitor is already on
 *     revelio.cards
 *
 * The Discord colours come from lib/discord-palette.ts, which the /discord
 * share image draws from too.
 */
const BRAND_GOLD = '#d4a83a'

// Card names and printings are data, not copy: they read the same in both
// catalogs. All three are Base Set Charms spells; set, number and cost are the
// real ones.
const SHARE_ROWS: readonly ShareRow[] = [
  { name: 'Obliviate', setCode: 'BS', number: '14', cost: 12, thumb: '/discord/obliviate-thumb.webp' },
  { name: 'Incendio', setCode: 'BS', number: '25', cost: 3, thumb: '/discord/incendio-thumb.webp' },
  { name: 'Confundus', setCode: 'BS', number: '47', cost: 5, thumb: '/discord/confundus-thumb.webp' },
]

const SAMPLE_CARD_THUMB = '/discord/alohomora-thumb.webp'

function CommandContext({ command }: { command: string }) {
  const t = useTranslations('discord')
  return (
    <p className="pl-12.5 text-xs" style={{ color: DISCORD_MUTED }}>
      {t.rich('usedCommand', {
        userName: t('you'),
        command,
        user: (chunks) => <b style={{ color: DISCORD_TEXT, fontWeight: 500 }}>{chunks}</b>,
        cmd: (chunks) => <span style={{ color: DISCORD_MENTION }}>{chunks}</span>,
      })}
    </p>
  )
}

function BotMessage({ time, children }: { time: string; children: React.ReactNode }) {
  const t = useTranslations('discord')
  return (
    <div className="flex gap-3.5">
      <BotAvatar className="size-9" />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-1.5">
          <span className="font-medium" style={{ color: DISCORD_HEADING }}>
            {t('botName')}
          </span>
          <span
            className="rounded-sm px-1 text-[0.6rem] font-semibold uppercase text-white"
            style={{ background: DISCORD_BLURPLE }}
          >
            {t('appTag')}
          </span>
          <span className="text-[0.69rem]" style={{ color: DISCORD_MUTED }}>
            {time}
          </span>
        </div>
        {children}
      </div>
    </div>
  )
}

function Container({ accent, children }: { accent: string; children: React.ReactNode }) {
  return (
    <div className="flex max-w-[30rem] overflow-hidden rounded" style={{ background: DISCORD_EMBED }}>
      <span className="w-1 shrink-0" style={{ background: accent }} />
      <div className="min-w-0 flex-1 px-3 py-2.5">{children}</div>
    </div>
  )
}

// A string select, closed: its placeholder and the chevron.
function SelectMenu({ placeholder }: { placeholder: string }) {
  return (
    <span
      className="flex items-center justify-between rounded px-3 py-1.5"
      style={{ background: DISCORD_SELECT, color: DISCORD_MUTED }}
    >
      {placeholder}
      <ChevronDown className="size-4" aria-hidden />
    </span>
  )
}

// card-view.ts bolds each label of a labelled pair.
const bold = (chunks: React.ReactNode) => <b style={{ color: DISCORD_HEADING }}>{chunks}</b>

export function CommandChannel() {
  const t = useTranslations('discord')
  return (
    <div
      data-testid="command-channel"
      className="overflow-hidden rounded-xl text-left text-sm leading-[1.375] shadow-2xl"
      style={{ background: DISCORD_CHANNEL, color: DISCORD_TEXT }}
    >
      <ChannelHeader />

      <div className="flex flex-col gap-3.5 px-4 pt-4 pb-2">
        <CommandContext command="/card" />
        <BotMessage time="21:04">
          <Container accent={LESSON_CHARMS}>
            <h3 className="text-lg font-bold" style={{ color: DISCORD_HEADING }}>
              {t('sample.cardName')}
            </h3>
            <p>{t.rich('sample.cardTags', { b: bold })}</p>
            <p className="mb-2">{t.rich('sample.cardStats', { b: bold })}</p>
            <Image
              src={SAMPLE_CARD_THUMB}
              alt={t('cardImageAlt', { name: t('sample.cardName') })}
              width={300}
              height={419}
              className="mb-2 h-auto w-40 rounded"
            />
            <p className="mb-2">{t('sample.cardText')}</p>
            <p className="mb-2">
              <em>{t('sample.cardFlavor')}</em>
            </p>
            <p className="text-xs" style={{ color: DISCORD_MUTED }}>
              {t('sample.cardFooter')}
            </p>
          </Container>
        </BotMessage>

        {/* On a phone the panel sits between the CTA and the commands, so the
            second answer is hidden there: one message already proves the point
            and saves a screen of scrolling. */}
        <div className="hidden flex-col gap-3.5 sm:flex">
          <BotMessage time="21:05">
            <Container accent={BRAND_GOLD}>
              <p className="mb-2">
                {t.rich('sample.shareLead', {
                  userName: t('you'),
                  query: t('sample.shareQuery'),
                  mention: (chunks) => (
                    <span className="rounded-sm px-0.5" style={{ background: '#3f4270', color: DISCORD_MENTION }}>
                      {chunks}
                    </span>
                  ),
                })}
              </p>
              <ul className="mb-2 flex flex-col gap-2">
                {SHARE_ROWS.map((row) => (
                  <li key={row.name} className="flex items-center justify-between gap-3">
                    <span>
                      <b style={{ color: DISCORD_HEADING }}>{row.name}</b> &middot; {row.setCode} #{row.number}
                      <br />
                      {t('sample.rowStats', { cost: row.cost })}
                    </span>
                    <Image
                      src={row.thumb}
                      alt={t('cardImageAlt', { name: row.name })}
                      width={300}
                      height={419}
                      className="h-auto w-10 shrink-0 rounded-sm"
                    />
                  </li>
                ))}
              </ul>
              <SelectMenu placeholder={t('sample.viewCard')} />
            </Container>
          </BotMessage>
        </div>
      </div>

      <MessageBox command="collection" option="set" value={t('sample.typing')} />
    </div>
  )
}
