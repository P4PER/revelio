import type { CSSProperties } from 'react'
import { createTranslator } from 'next-intl'
import { render } from '@react-email/render'
import { Heading, Link, Text } from '@react-email/components'
import { getPathname } from '@/../i18n/navigation'
import { TIME_ZONE } from '@/../i18n/routing'
import { EmailLayout, emailHeading, emailText } from './layout'
import { EMAIL_MESSAGES } from './messages'
import type { EmailLocale, RenderedEmail } from './types'

export type BanEmailInput = {
  reason: string
  expiresAt: Date | null
  // Operator contact from site settings for the footer; '' hides that line.
  contactEmail: string
  // The user table stores no language yet; once it does, the caller passes it.
  locale?: EmailLocale
}

const link: CSSProperties = { color: '#3B3194', textDecoration: 'underline' }

// createTranslator, not getTranslations: server actions have no request locale
// here, same as renderOtpEmail and renderContactEmail.
function banTranslator(locale: EmailLocale) {
  return createTranslator({ locale, messages: EMAIL_MESSAGES[locale], namespace: 'email.ban', timeZone: TIME_ZONE })
}

function BanEmail({ reason, expiresAt, contactEmail, locale }: Required<BanEmailInput>) {
  const t = banTranslator(locale)
  // Read at render time so tests and runtime pick up the current env.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://revelio.cards'
  const termsUrl = `${baseUrl}${getPathname({ href: '/terms', locale })}`
  const contactUrl = `${baseUrl}${getPathname({ href: '/contact', locale })}`
  return (
    <EmailLayout locale={locale} contactEmail={contactEmail}>
      <Heading as="h1" style={emailHeading}>
        {t('heading')}
      </Heading>
      <Text style={emailText}>
        {expiresAt ? t('measureTemporary', { date: expiresAt }) : t('measurePermanent')}
      </Text>
      {/* Untrusted admin input: rendered only as escaped React children. */}
      <Text style={emailText}>
        <strong>{t('reasonLabel')}:</strong> {reason}
      </Text>
      <Text style={emailText}>
        {t.rich('grounds', {
          terms: (chunks) => (
            <Link href={termsUrl} style={link}>
              {chunks}
            </Link>
          ),
        })}
      </Text>
      <Text style={emailText}>
        {t.rich('objection', {
          contact: (chunks) => (
            <Link href={contactUrl} style={link}>
              {chunks}
            </Link>
          ),
        })}
      </Text>
    </EmailLayout>
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
