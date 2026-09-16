import type { CSSProperties, ReactNode } from 'react'
import { createTranslator } from 'next-intl'
import {
  Body, Column, Container, Head, Html, Img, Link, Preview, Row, Section, Text,
} from '@react-email/components'
import { EMAIL_MESSAGES } from './messages'
import type { EmailLocale } from './types'

type EmailLayoutProps = {
  locale: EmailLocale
  // Inbox preview line; omitted when the heading already says enough.
  preview?: string
  // Operator contact from site settings; '' hides the footer line.
  contactEmail: string
  children: ReactNode
}

// --- Design B ("Parchment"): light ground, gold band, indigo headings. ---
// No side/top padding so the band spans edge-to-edge and sits flush at the very top.
const main: CSSProperties = { backgroundColor: '#FBF3DC', margin: 0, padding: '0 0 28px' }

// Just centers the content column; the parchment page is the Body itself.
const container: CSSProperties = { maxWidth: '600px', width: '100%', margin: '0 auto' }

// Gold gradient top band. backgroundColor is the Outlook fallback; backgroundImage
// is the reveal-glow gradient (gold-dark, gold, gold-light, gold).
const band: CSSProperties = {
  height: '6px',
  lineHeight: '6px',
  fontSize: '1px',
  backgroundColor: '#E8B23A',
  backgroundImage: 'linear-gradient(90deg,#C8881E 0%,#E8B23A 38%,#F6D58B 62%,#E8B23A 100%)',
}

const pad: CSSProperties = { padding: '28px 30px 30px' }

const logo: CSSProperties = { display: 'block', width: '150px', height: 'auto', border: 0, margin: '0 0 6px' }

// Footer, set apart below the content card: centered, small, muted, with a hairline
// divider above it. Quieter than the body but still WCAG-legible (~5:1 on parchment).
const footer: CSSProperties = {
  maxWidth: '600px',
  width: '100%',
  margin: '0 auto',
  padding: '18px 30px 0',
  borderTop: '1px solid #EBDDB8',
  textAlign: 'center',
}

const footerText: CSSProperties = {
  margin: 0,
  fontFamily: 'Arial,Helvetica,sans-serif',
  fontSize: '11px',
  lineHeight: '1.5',
  color: '#6a6480',
}

const footerLink: CSSProperties = {
  display: 'inline-block',
  margin: '6px 0 0',
  fontFamily: 'Arial,Helvetica,sans-serif',
  fontSize: '11px',
  color: '#3B3194',
  textDecoration: 'none',
}

// Inline (within-text) footer link - underlined for affordance since it sits in muted copy.
const footerLinkInline: CSSProperties = { color: '#3B3194', textDecoration: 'underline' }

// Content styles every template on this layout shares, so headings and body
// copy cannot drift apart between emails.
export const emailHeading: CSSProperties = {
  margin: '6px 0 0',
  fontFamily: "'Poppins',Arial,Helvetica,sans-serif",
  fontSize: '21px',
  fontWeight: 600,
  color: '#3B3194',
}

export const emailText: CSSProperties = {
  margin: '8px 0 0',
  fontFamily: 'Arial,Helvetica,sans-serif',
  fontSize: '15px',
  lineHeight: '1.6',
  color: '#443f66',
}

/**
 * The branded chrome of every user-facing email: gold band, logo, content
 * column and the fan-project footer. Copy comes from `email.footer`, read via
 * createTranslator because emails render outside a request locale.
 */
export function EmailLayout({ locale, preview, contactEmail, children }: EmailLayoutProps) {
  const t = createTranslator({ locale, messages: EMAIL_MESSAGES[locale], namespace: 'email.footer' })
  // Read at render time (not module load) so runtime/tests pick up the current env.
  // Public site origin the logo image and footer link resolve against.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://revelio.cards'
  return (
    <Html lang={locale}>
      <Head>
        {/* Force light rendering so dark-mode clients don't paint a navy surround. */}
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <style
          dangerouslySetInnerHTML={{
            __html:
              "@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap');",
          }}
        />
      </Head>
      {preview ? <Preview>{preview}</Preview> : null}
      <Body style={main}>
        {/* Full-width gold gradient band, flush at the very top of the email. */}
        <Row>
          <Column style={band}>{' '}</Column>
        </Row>
        <Container style={container}>
          <Section style={pad}>
            <Img src={`${baseUrl}/revelio-logo-email.png`} alt="Revelio" width="150" height="45" style={logo} />
            {children}
          </Section>
        </Container>

        {/* Footer: contact (when configured) + fan-project disclaimer + site link. */}
        <Section style={footer}>
          {contactEmail ? (
            <Text style={footerText}>
              {t('contactLabel')}{' '}
              <Link href={`mailto:${contactEmail}`} style={footerLinkInline}>
                {contactEmail}
              </Link>
            </Text>
          ) : null}
          <Text style={footerText}>{t('disclaimer')}</Text>
          <Link href={baseUrl} style={footerLink}>
            {t('linkLabel')}
          </Link>
        </Section>
      </Body>
    </Html>
  )
}
