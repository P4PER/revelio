import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { ReactNode } from 'react'
import { ImageResponse } from 'next/og'
import { getTranslations } from 'next-intl/server'
import { getPathname } from '@/../i18n/navigation'
import {
  DISCORD_BLURPLE,
  DISCORD_CHANNEL,
  DISCORD_EMBED,
  DISCORD_HEADING,
  DISCORD_MENTION,
  DISCORD_MUTED,
  DISCORD_TEXT,
  LESSON_CHARMS,
} from '@/lib/discord-palette'
import { OG_SIZE, clampOgTitle } from '@/lib/seo'
import { SITE_URL } from '@/lib/site'

// The brand files the share images draw, from public/ (see loadPublicSvg).
const LOGO_FILE = 'revelio-logo-on-dark.svg'
const DARK_ICON_FILE = 'revelio-icon-on-dark.svg'
// The logo's own proportions (262 x 78), so a height fixes its width.
const LOGO_ASPECT = 262 / 78

// Satori cannot decode WebP, so the /discord share image carries its own JPEG of
// the page's sample card (public/discord/alohomora-thumb.webp), made once with sharp.
const DISCORD_CARD_URL = new URL('./og-assets/alohomora-card.jpg', import.meta.url)

// One font weight, so a labelled pair's label is set apart by colour, not bold.
const PAIR_LABEL_COLOR = '#ffffff'

// Read the font from disk (not fetch): on the Node runtime `new URL(…,
// import.meta.url)` is a file:// URL, which undici's fetch rejects with
// "not implemented yet". Anchoring to import.meta.url still lets Next trace and
// bundle the .ttf into the build output.
let fontPromise: Promise<Buffer> | null = null
function loadFont(): Promise<Buffer> {
  if (!fontPromise) {
    fontPromise = readFile(fileURLToPath(new URL('./fonts/Poppins-SemiBold.ttf', import.meta.url)))
  }
  return fontPromise
}

// Static SVGs from public/ (the logo, the dark icon, lesson symbols), inlined as
// data URIs because satori can't resolve a relative URL. Best-effort: a failed read
// resolves to null and the image is drawn without it. Only a success is cached, so
// one transient error cannot drop a logo or icon until the process restarts.
const publicSvgCache = new Map<string, Promise<string | null>>()
function loadPublicSvg(file: string): Promise<string | null> {
  let uri = publicSvgCache.get(file)
  if (!uri) {
    uri = readFile(join(process.cwd(), 'public', file)).then(
      (buf) => `data:image/svg+xml;base64,${buf.toString('base64')}`,
      () => {
        publicSvgCache.delete(file)
        return null
      },
    )
    publicSvgCache.set(file, uri)
  }
  return uri
}

function loadLessonIcon(code: string): Promise<string | null> {
  return loadPublicSvg(`lessons/${code}.svg`)
}

// The dark logo at `height`, or nothing when its file could not be read.
function Logo({ uri, height }: { uri: string | null; height: number }) {
  if (!uri) return null
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={uri} width={Math.round(height * LOGO_ASPECT)} height={height} alt="" />
}

// Best-effort like the lesson icons: a failed read omits the art. A failure is not
// cached, so one transient error cannot drop the art until the process restarts.
let discordCardPromise: Promise<string | null> | null = null
function loadDiscordCard(): Promise<string | null> {
  if (!discordCardPromise) {
    discordCardPromise = readFile(fileURLToPath(DISCORD_CARD_URL)).then(
      (buf) => `data:image/jpeg;base64,${buf.toString('base64')}`,
      () => {
        discordCardPromise = null
        return null
      },
    )
  }
  return discordCardPromise
}

// The bot bolds each label of a card's labelled pairs (bot/src/discord/v2/card-view.ts).
function pairLabel(chunks: ReactNode) {
  return <span style={{ color: PAIR_LABEL_COLOR }}>{chunks}</span>
}

// Satori trims the spaces at both ends of every text run in a flex row, which glues
// "Type" to "Spell" in a rich message. So each word becomes its own flex item and the
// row's columnGap stands in for the space; a long line then wraps between words.
function splitWords(node: ReactNode): ReactNode[] {
  let key = 0
  const split = (n: ReactNode): ReactNode[] => {
    if (typeof n === 'string') {
      return n.split(/\s+/).filter(Boolean).map((word) => <span key={`w${key++}`}>{word}</span>)
    }
    return Array.isArray(n) ? n.flatMap(split) : [n]
  }
  return split(node)
}

/**
 * Renders a 1200x630 branded social card: the revelio lockup top-left, a large
 * `title`, and a smaller `subtitle`, on the gold-on-indigo scheme. Shared by the
 * default site OG image and per-set OG images.
 */
export async function renderBrandOgImage(opts: {
  title: string
  subtitle: string
}): Promise<ImageResponse> {
  const [font, logoUri] = await Promise.all([loadFont(), loadPublicSvg(LOGO_FILE)])
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px',
          background: 'linear-gradient(135deg, #13122A 0%, #181634 60%, #3B3194 160%)',
          fontFamily: 'Poppins',
        }}
      >
        <div style={{ display: 'flex' }}>
          <Logo uri={logoUri} height={64} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span style={{ fontSize: 76, color: '#FBF3DC', lineHeight: 1.05 }}>
            {clampOgTitle(opts.title)}
          </span>
          <span style={{ fontSize: 36, color: '#E8B23A' }}>{opts.subtitle}</span>
        </div>
      </div>
    ),
    {
      width: OG_SIZE.width,
      height: OG_SIZE.height,
      fonts: [{ name: 'Poppins', data: font, weight: 600, style: 'normal' }],
    },
  )
}

/** The default site share card (localized tagline + domain), reused as the
 * fallback wherever a page-specific image has no data to render. */
export async function renderDefaultOgImage(locale: string): Promise<ImageResponse> {
  const t = await getTranslations({ locale, namespace: 'home' })
  return renderBrandOgImage({ title: t('tagline'), subtitle: 'revelio.cards' })
}

/**
 * Deck share card: full-bleed starting-character art with top/bottom scrims, the
 * revelio lockup, and the deck name + format + up to four lesson icons — the
 * DeckHeroCard aesthetic at 1200x630. `artDataUri` must already be resolved (the
 * route fetches it so a failure can fall back to the default image).
 */
export async function renderDeckOgImage(opts: {
  name: string
  formatLabel: string
  lessonCodes: string[]
  artDataUri: string
}): Promise<ImageResponse> {
  const [font, logoUri] = await Promise.all([loadFont(), loadPublicSvg(LOGO_FILE)])
  const lessonUris = (await Promise.all(opts.lessonCodes.slice(0, 4).map(loadLessonIcon))).filter(
    (u): u is string => u != null,
  )
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', fontFamily: 'Poppins' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={opts.artDataUri}
          width={OG_SIZE.width}
          height={OG_SIZE.height}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          alt=""
        />
        <div
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 200, display: 'flex',
            alignItems: 'flex-start', padding: '40px 56px',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.75), transparent)',
          }}
        >
          <div style={{ display: 'flex' }}>
            <Logo uri={logoUri} height={44} />
          </div>
        </div>
        <div
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column',
            gap: 16, padding: '140px 56px 56px 56px',
            background: 'linear-gradient(to top, rgba(0,0,0,0.88) 45%, transparent)',
          }}
        >
          <span style={{ fontSize: 68, color: '#FBF3DC', lineHeight: 1.05 }}>{clampOgTitle(opts.name)}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <span style={{ fontSize: 32, color: '#E8B23A' }}>{opts.formatLabel}</span>
            {lessonUris.length > 0 && (
              <div style={{ display: 'flex', gap: 10 }}>
                {lessonUris.map((uri, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={uri} width={40} height={40} alt="" />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    {
      width: OG_SIZE.width,
      height: OG_SIZE.height,
      fonts: [{ name: 'Poppins', data: font, weight: 600, style: 'normal' }],
    },
  )
}

/**
 * The /discord page's share card: the page headline on the left, and on the right
 * a /card answer drawn as the bot sends it (the page's CommandChannel, cropped by
 * the canvas edge). Every string is the page's own, so the image follows the locale.
 */
export async function renderDiscordOgImage(locale: string): Promise<ImageResponse> {
  const [font, logoUri, iconUri, cardUri, t] = await Promise.all([
    loadFont(),
    loadPublicSvg(LOGO_FILE),
    loadPublicSvg(DARK_ICON_FILE),
    loadDiscordCard(),
    getTranslations({ locale, namespace: 'discord' }),
  ])
  // The page being shared, as the reader would type it: /discord or /de/discord.
  const pageUrl = `${new URL(SITE_URL).host}${getPathname({ href: '/discord', locale })}`
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', overflow: 'hidden',
          padding: '64px 0 0 72px', fontFamily: 'Poppins',
          background: 'linear-gradient(135deg, #13122A 0%, #181634 60%, #3B3194 160%)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 520, paddingBottom: 72 }}>
          <div style={{ display: 'flex' }}>
            <Logo uri={logoUri} height={64} />
          </div>
          {/* The <b> part of the heading takes its own line, in gold. */}
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 62, lineHeight: 1.08, color: '#FBF3DC' }}>
            {t.rich('heading', { b: (chunks) => <span style={{ color: '#E8B23A' }}>{chunks}</span> })}
            <span style={{ fontSize: 28, lineHeight: 1.4, color: '#B9B4D6', marginTop: 18 }}>{pageUrl}</span>
          </div>
        </div>
        <div
          style={{
            display: 'flex', flexDirection: 'column', marginLeft: 40, width: 600, minHeight: 640,
            padding: '22px 28px', borderRadius: '20px 0 0 0', background: DISCORD_CHANNEL,
            boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ display: 'flex', fontSize: 20, color: DISCORD_MUTED, marginBottom: 18 }}>
            <span style={{ marginRight: 10 }}>#</span>
            <span style={{ color: DISCORD_HEADING }}>{t('channelName')}</span>
          </div>
          <div style={{ display: 'flex', columnGap: 5, fontSize: 17, color: DISCORD_MUTED, marginLeft: 66, marginBottom: 6 }}>
            {splitWords(t.rich('usedCommand', {
              userName: t('you'),
              command: '/card',
              user: (chunks) => <span style={{ color: DISCORD_TEXT }}>{chunks}</span>,
              cmd: (chunks) => <span style={{ color: DISCORD_MENTION }}>{chunks}</span>,
            }))}
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div
              style={{
                display: 'flex', width: 50, height: 50, borderRadius: 50, flexShrink: 0,
                alignItems: 'center', justifyContent: 'center', background: '#13122A',
              }}
            >
              {iconUri && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={iconUri} width={33} height={33} alt="" />
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 22, color: DISCORD_HEADING }}>{t('botName')}</span>
                <span
                  style={{
                    display: 'flex', fontSize: 14, color: '#ffffff', background: DISCORD_BLURPLE,
                    borderRadius: 4, padding: '1px 6px', textTransform: 'uppercase',
                  }}
                >
                  {t('appTag')}
                </span>
                <span style={{ fontSize: 15, color: DISCORD_MUTED }}>21:04</span>
              </div>
              <div style={{ display: 'flex', width: 470, borderRadius: 6, overflow: 'hidden', background: DISCORD_EMBED }}>
                <div style={{ display: 'flex', width: 6, background: LESSON_CHARMS }} />
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '16px 20px' }}>
                  <span style={{ fontSize: 28, color: DISCORD_HEADING }}>{t('sample.cardName')}</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 5, fontSize: 18, color: '#b5bac1', marginBottom: 2 }}>
                    {splitWords(t.rich('sample.cardTags', { b: pairLabel }))}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 5, fontSize: 18, color: '#b5bac1', marginBottom: 14 }}>
                    {splitWords(t.rich('sample.cardStats', { b: pairLabel }))}
                  </div>
                  {cardUri && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cardUri} width={240} height={335} style={{ borderRadius: 8 }} alt="" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: OG_SIZE.width,
      height: OG_SIZE.height,
      fonts: [{ name: 'Poppins', data: font, weight: 600, style: 'normal' }],
    },
  )
}
