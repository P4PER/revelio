import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { ReactNode } from 'react'
import sharp from 'sharp'
import { ImageResponse } from 'next/og'
import { getTranslations } from 'next-intl/server'
import { OG_SIZE, clampOgTitle } from '@/lib/seo'

// The wand-and-star mark, inlined from logos/revelio-icon.svg and embedded as a
// data URI so the renderer makes no external image request.
const MARK_SVG = `<svg width="80" height="80" viewBox="16 15 68 68" xmlns="http://www.w3.org/2000/svg"><g transform="translate(-7,2.5)"><polygon points="26.51,72.70 33.49,79.30 65.16,41.10 62.84,38.90" fill="#3B3194"/><line x1="40.12" y1="73.30" x2="32.12" y2="65.74" stroke="#C8881E" stroke-width="2.6" stroke-linecap="round"/><path d="M70,16 Q73.4,30.6 88,34 Q73.4,37.4 70,52 Q66.6,37.4 52,34 Q66.6,30.6 70,16 Z" fill="#E8B23A"/><path d="M70,26 Q71.6,32.4 78,34 Q71.6,35.6 70,42 Q68.4,35.6 62,34 Q68.4,32.4 70,26 Z" fill="#F6D58B"/><path d="M52,14 Q53.2,18.8 58,20 Q53.2,21.2 52,26 Q50.8,21.2 46,20 Q50.8,18.8 52,14 Z" fill="#E8B23A"/><path d="M78,53.5 Q78.9,57.1 82.5,58 Q78.9,58.9 78,62.5 Q77.1,58.9 73.5,58 Q77.1,57.1 78,53.5 Z" fill="#E8B23A"/></g></svg>`
const MARK_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString('base64')}`

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

// Lesson symbols are static public SVGs; read from disk and inline as data URIs
// (satori can't resolve a relative URL). Best-effort: a missing/unreadable icon
// resolves to null and is simply omitted — it never fails the image.
const lessonIconCache = new Map<string, string | null>()
async function loadLessonIcon(code: string): Promise<string | null> {
  const cached = lessonIconCache.get(code)
  if (cached !== undefined) return cached
  let uri: string | null = null
  try {
    const buf = await readFile(join(process.cwd(), 'public', 'lessons', `${code}.svg`))
    uri = `data:image/svg+xml;base64,${buf.toString('base64')}`
  } catch {
    uri = null
  }
  lessonIconCache.set(code, uri)
  return uri
}

// Discord's surface palette, as hardcoded in components/discord/command-channel.tsx:
// the image depicts Discord's UI, which does not follow the Revelio theme.
const DISCORD_CHANNEL = '#313338'
const DISCORD_EMBED = '#2b2d31'
const DISCORD_HEADING = '#f2f3f5'
const DISCORD_TEXT = '#dbdee1'
const DISCORD_MUTED = '#949ba4'
const DISCORD_BLURPLE = '#5865F2'
const DISCORD_MENTION = '#c2c5f7'
const LESSON_CHARMS = '#0069A9'

// The /discord page's sample card, converted to PNG because satori cannot decode
// WebP. Best-effort like the lesson icons: a failure omits the art.
let discordCardPromise: Promise<string | null> | null = null
function loadDiscordCard(): Promise<string | null> {
  if (!discordCardPromise) {
    discordCardPromise = readFile(join(process.cwd(), 'public', 'discord', 'alohomora-thumb.webp'))
      .then((buf) => sharp(buf).png().toBuffer())
      .then((png) => `data:image/png;base64,${png.toString('base64')}`)
      .catch(() => null)
  }
  return discordCardPromise
}

// The bot bolds each label of a card's labelled pairs (bot/src/discord/v2/card-view.ts).
// There is one font weight here, so the label is set apart by colour instead.
const pairLabel = (chunks: ReactNode) => <span style={{ color: '#ffffff' }}>{chunks}</span>

// Satori trims the spaces at both ends of every text run in a flex row, which glues
// "Type" to "Spell" in a rich message. So each word becomes its own flex item and the
// row's columnGap stands in for the space; a long line then wraps between words.
function splitWords(node: ReactNode): ReactNode[] {
  if (typeof node === 'string') {
    return node.split(/\s+/).filter(Boolean).map((word, i) => <span key={`w${i}`}>{word}</span>)
  }
  return Array.isArray(node) ? node.flatMap(splitWords) : [node]
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
  const font = await loadFont()
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK_DATA_URI} width={64} height={64} alt="" />
          <span style={{ fontSize: 40, color: '#FBF3DC', letterSpacing: '-1px' }}>revelio</span>
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
  const font = await loadFont()
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MARK_DATA_URI} width={44} height={44} alt="" />
            <span style={{ fontSize: 30, color: '#FBF3DC', letterSpacing: '-1px' }}>revelio</span>
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
  const [font, cardUri, t] = await Promise.all([
    loadFont(),
    loadDiscordCard(),
    getTranslations({ locale, namespace: 'discord' }),
  ])
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MARK_DATA_URI} width={64} height={64} alt="" />
            <span style={{ fontSize: 40, color: '#FBF3DC', letterSpacing: '-1px' }}>revelio</span>
          </div>
          {/* The <b> part of the heading takes its own line, in gold. */}
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 62, lineHeight: 1.08, color: '#FBF3DC' }}>
            {t.rich('heading', { b: (chunks) => <span style={{ color: '#E8B23A' }}>{chunks}</span> })}
            <span style={{ fontSize: 28, lineHeight: 1.4, color: '#B9B4D6', marginTop: 18 }}>revelio.cards/discord</span>
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={MARK_DATA_URI} width={33} height={33} alt="" />
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
