import Image from 'next/image'
import { useTranslations } from 'next-intl'

type SearchLine = { name: string; setCode: string; number: string }

/*
 * A hand-built rendering of what bot/src/discord/embeds/card-embed.ts and
 * search-embed.ts actually produce. It is markup rather than a screenshot so it
 * stays sharp at any width, works in both locales and costs one small image
 * instead of four. The trade is that it is only as true as this comment keeps
 * it. When those two builders change, change this:
 *   - the card embed's colour bar is the LESSON colour (Charms is #0069A9)
 *   - the search embed's bar is BRAND_GOLD (#d4a83a)
 *   - the card footer is `{setName} - #{number}`
 *   - the search footer is `Page {page} of {pages} - view all on revelio.cards`
 *   - the card fields are the ones the command adds, in order
 *   - the card art is the embed image (setImage), under the fields and above the
 *     footer, not a corner thumbnail; a horizontal card would show landscape
 *
 * The colours below are Discord's own surface palette, deliberately hardcoded
 * rather than taken from the Revelio theme tokens: this depicts Discord's UI,
 * which does not follow the visitor's light/dark choice.
 */
const DISCORD_CHANNEL = '#313338'
const DISCORD_EMBED = '#2b2d31'
const DISCORD_INPUT = '#383a40'
const DISCORD_HEADING = '#f2f3f5'
const DISCORD_TEXT = '#dbdee1'
const DISCORD_MUTED = '#949ba4'
const DISCORD_LINK = '#00a8fc'
const DISCORD_BLURPLE = '#5865F2'
const DISCORD_MENTION = '#c2c5f7'

const LESSON_CHARMS = '#0069A9'
const BRAND_GOLD = '#d4a83a'

// Card names are data, not copy: they read the same in both catalogs.
const SEARCH_LINES: readonly SearchLine[] = [
  { name: 'Obliviate', setCode: 'BS', number: '14' },
  { name: 'Incendio', setCode: 'BS', number: '25' },
  { name: 'Titillando', setCode: 'BS', number: '36' },
  { name: 'Bluebell Flames', setCode: 'BS', number: '44' },
  { name: 'Confundus', setCode: 'BS', number: '47' },
]

const SAMPLE_CARD_THUMB = '/discord/alohomora-thumb.webp'

// The real wand mark, on the midnight circle a Discord avatar crops to. The
// mark's own indigo would nearly vanish against Discord's grey surface, so the
// circle carries the brand's background rather than being transparent.
// Decorative: the bot's name is printed beside it on every message.
function BotAvatar() {
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{ background: '#13122A' }}
    >
      <Image
        src="/revelio-icon.svg"
        alt=""
        width={68}
        height={68}
        aria-hidden
        className="size-5"
      />
    </span>
  )
}

function CommandContext({ command }: { command: string }) {
  const t = useTranslations('discord')
  return (
    <p className="pl-11 text-xs" style={{ color: DISCORD_MUTED }}>
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
    <div className="flex gap-3">
      <BotAvatar />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-1.5">
          <span className="text-sm font-semibold" style={{ color: DISCORD_HEADING }}>
            {t('botName')}
          </span>
          <span
            className="rounded-sm px-1 text-[0.6rem] font-semibold uppercase text-white"
            style={{ background: DISCORD_BLURPLE }}
          >
            {t('appTag')}
          </span>
          <span className="text-[0.68rem]" style={{ color: DISCORD_MUTED }}>
            {time}
          </span>
        </div>
        {children}
      </div>
    </div>
  )
}

function Embed({ accent, children }: { accent: string; children: React.ReactNode }) {
  return (
    <div className="flex max-w-[27rem] overflow-hidden rounded" style={{ background: DISCORD_EMBED }}>
      <span className="w-1 shrink-0" style={{ background: accent }} />
      <div className="min-w-0 flex-1 px-3 py-2.5">{children}</div>
    </div>
  )
}

function EmbedField({ name, value }: { name: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold" style={{ color: DISCORD_HEADING }}>
        {name}
      </div>
      <div className="text-[0.8rem]" style={{ color: DISCORD_TEXT }}>
        {value}
      </div>
    </div>
  )
}

export function CommandChannel() {
  const t = useTranslations('discord')
  return (
    <div
      className="overflow-hidden rounded-xl text-left text-[0.84rem] shadow-2xl"
      style={{ background: DISCORD_CHANNEL, color: DISCORD_TEXT }}
    >
      <div
        className="flex items-center gap-1.5 border-b px-3.5 py-2 text-[0.78rem] font-semibold"
        style={{ borderColor: '#26282c', color: DISCORD_MUTED }}
      >
        <span className="text-base leading-none">#</span>
        <span style={{ color: DISCORD_HEADING }}>{t('channelName')}</span>
      </div>

      <div className="flex flex-col gap-3 px-3.5 pt-3.5 pb-4">
        <CommandContext command="/card" />
        <BotMessage time="21:04">
          <Embed accent={LESSON_CHARMS}>
            <p className="mb-1 text-sm font-semibold" style={{ color: DISCORD_LINK }}>
              {t('sample.cardName')}
            </p>
            <p className="mb-2 text-[0.8rem]">{t('sample.cardText')}</p>
            <div className="mb-2 grid grid-cols-3 gap-x-3 gap-y-1.5">
              <EmbedField name={t('sample.fieldType')} value={t('sample.fieldTypeValue')} />
              <EmbedField name={t('sample.fieldLesson')} value={t('sample.fieldLessonValue')} />
              <EmbedField name={t('sample.fieldCost')} value={t('sample.fieldCostValue')} />
            </div>
            <Image
              src={SAMPLE_CARD_THUMB}
              alt={t('cardImageAlt', { name: t('sample.cardName') })}
              width={300}
              height={419}
              className="mb-2 h-auto w-40 rounded"
            />
            <p className="text-[0.69rem]" style={{ color: DISCORD_MUTED }}>
              {t('sample.cardFooter')}
            </p>
          </Embed>
        </BotMessage>

        {/* On a phone the panel sits between the CTA and the commands, so the
            second answer is hidden there: one embed already proves the point
            and saves a screen of scrolling. */}
        <div className="hidden flex-col gap-3 sm:flex">
          <CommandContext command="/search" />
          <BotMessage time="21:05">
            <Embed accent={BRAND_GOLD}>
              <p className="mb-1 text-sm font-semibold" style={{ color: DISCORD_LINK }}>
                {t('sample.searchTitle')}
              </p>
              <ul className="mb-2 text-[0.8rem]">
                {SEARCH_LINES.map((line) => (
                  <li key={line.name}>
                    <b style={{ color: DISCORD_HEADING }}>{line.name}</b> &middot; {line.setCode} #
                    {line.number}
                  </li>
                ))}
              </ul>
              <p className="text-[0.69rem]" style={{ color: DISCORD_MUTED }}>
                {t('sample.searchFooter')}
              </p>
            </Embed>
          </BotMessage>
        </div>
      </div>

      <div
        className="mx-3.5 mb-3.5 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[0.82rem]"
        style={{ background: DISCORD_INPUT }}
      >
        <span
          className="rounded-sm px-1"
          style={{ background: '#3f4270', color: DISCORD_MENTION }}
        >
          /collection
        </span>
        <span>{t('sample.typing')}</span>
        {/* Discord's own caret, so the line reads as mid-typing rather than sent.
            globals.css owns the keyframes as --animate-caret-blink. */}
        <span
          className="inline-block h-4 w-px animate-caret-blink motion-reduce:animate-none"
          style={{ background: DISCORD_TEXT }}
          aria-hidden
        />
      </div>
    </div>
  )
}
