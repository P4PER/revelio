import type { CSSProperties } from 'react'
import { createTranslator } from 'next-intl'
import { render } from '@react-email/render'
import { Body, Container, Heading, Html, Link, Text } from '@react-email/components'
import type { routing } from '@/../i18n/routing'
import { getPathname } from '@/../i18n/navigation'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'
import type { RenderedEmail } from './types'

type NoticeLocale = (typeof routing.locales)[number]

export type BanEmailInput = {
  reason: string
  expiresAt: Date | null
  // The user table stores no language yet; once it does, the caller passes it.
  locale?: NoticeLocale
}

// Same pattern as TERMS_DOCUMENTS: adding a locale to routing.locales fails the
// typecheck here until its catalog is wired in. The cast only unifies the
// inferred catalog types, which hold the same email.ban keys.
const MESSAGES = { en, de: de as typeof en } satisfies Record<NoticeLocale, typeof en>

// Ban expiry dates are picked as calendar days in the admin form and stored at
// UTC midnight, so they are shown in the operator's zone, where that is still
// the same day.
const TIME_ZONE = 'Europe/Berlin'

const main: CSSProperties = { backgroundColor: '#FBF3DC', margin: 0, padding: '24px 0' }
const container: CSSProperties = { maxWidth: '600px', width: '100%', margin: '0 auto', padding: '0 30px' }
const heading: CSSProperties = {
  fontFamily: "'Poppins',Arial,Helvetica,sans-serif",
  fontSize: '20px',
  fontWeight: 600,
  color: '#3B3194',
}
const row: CSSProperties = {
  margin: '8px 0',
  fontFamily: 'Arial,Helvetica,sans-serif',
  fontSize: '14px',
  lineHeight: '22px',
  color: '#443f66',
}
const link: CSSProperties = { color: '#3B3194', textDecoration: 'underline' }

// createTranslator, not getTranslations: server actions have no request locale
// here, same as renderOtpEmail and renderContactEmail.
function banTranslator(locale: NoticeLocale) {
  return createTranslator({ locale, messages: MESSAGES[locale], namespace: 'email.ban', timeZone: TIME_ZONE })
}

function BanEmail({ reason, expiresAt, locale }: Required<BanEmailInput>) {
  const t = banTranslator(locale)
  // Read at render time so tests and runtime pick up the current env.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://revelio.cards'
  const termsUrl = `${baseUrl}${getPathname({ href: '/terms', locale })}`
  const contactUrl = `${baseUrl}${getPathname({ href: '/contact', locale })}`
  return (
    <Html lang={locale}>
      <Body style={main}>
        <Container style={container}>
          <Heading as="h1" style={heading}>
            {t('heading')}
          </Heading>
          <Text style={row}>
            {expiresAt ? t('measureTemporary', { date: expiresAt }) : t('measurePermanent')}
          </Text>
          {/* Untrusted admin input: rendered only as escaped React children. */}
          <Text style={row}>
            <strong>{t('reasonLabel')}:</strong> {reason}
          </Text>
          <Text style={row}>
            {t.rich('grounds', {
              terms: (chunks) => (
                <Link href={termsUrl} style={link}>
                  {chunks}
                </Link>
              ),
            })}
          </Text>
          <Text style={row}>
            {t.rich('objection', {
              contact: (chunks) => (
                <Link href={contactUrl} style={link}>
                  {chunks}
                </Link>
              ),
            })}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

/**
 * Statement of reasons for an account suspension (Art. 17 DSA): the measure and
 * its duration, the facts, the terms relied on, that a person decided, and how
 * to object.
 */
export async function renderBanEmail({ locale = 'en', ...input }: BanEmailInput): Promise<RenderedEmail> {
  const subject = banTranslator(locale)('subject')
  const element = <BanEmail {...input} locale={locale} />
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { subject, html, text }
}
