import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
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
