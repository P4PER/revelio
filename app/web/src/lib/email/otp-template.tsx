import type { CSSProperties } from 'react'
import { createTranslator } from 'next-intl'
import { render } from '@react-email/render'
import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components'
import en from '@/../messages/en.json'

export type OtpEmailType = 'sign-in' | 'email-verification' | 'change-email'

interface OtpEmailInput {
  otp: string
  type: OtpEmailType
  contactEmail: string
}

interface RenderedEmail {
  subject: string
  html: string
  text: string
}

// OTP lifetime shown to the reader — keep in sync with `expiresIn` (600s) in auth.ts.
const EXPIRY_MINUTES = 10

// Copy lives in the next-intl catalog (messages/en.json → `email.otp`), read via
// createTranslator so it works outside a request/locale context (the Better Auth
// hook has none). English-only for now; wire a real locale in when available.
function otpTranslator() {
  return createTranslator({ locale: 'en', messages: en, namespace: 'email.otp' })
}

type Translate = ReturnType<typeof otpTranslator>

function OtpEmail({ otp, type, contactEmail, t }: OtpEmailInput & { t: Translate }) {
  // Read at render time (not module load) so runtime/tests pick up the current env.
  // Public site origin the logo image and footer link resolve against.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://revelio.cards'
  return (
    <Html lang="en">
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
      <Preview>{t('preview', { code: otp, minutes: EXPIRY_MINUTES })}</Preview>
      <Body style={main}>
        {/* Full-width gold gradient band, flush at the very top of the email. */}
        <Row>
          <Column style={band}>{' '}</Column>
        </Row>
        <Container style={container}>
          <Section style={pad}>
            <Img
              src={`${baseUrl}/revelio-logo-email.png`}
              alt="Revelio"
              width="150"
              height="45"
              style={logo}
            />
            <Heading as="h1" style={heading}>
              {t(`heading.${type}`)}
            </Heading>
            <Text style={intro}>{t(`intro.${type}`)}</Text>

            <Section style={codeBox}>
              <Text style={codeText}>{otp}</Text>
            </Section>
            <Text style={expiry}>{t('expiry', { minutes: EXPIRY_MINUTES })}</Text>

            <Hr style={hr} />
            <Text style={fine}>{t('reassurance')}</Text>
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

export async function renderOtpEmail({ otp, type, contactEmail }: OtpEmailInput): Promise<RenderedEmail> {
  const t = otpTranslator()
  const subject = t(`subject.${type}`, { code: otp })
  const element = <OtpEmail otp={otp} type={type} contactEmail={contactEmail} t={t} />
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { subject, html, text }
}

// --- Design B ("Parchment"): light ground, gold band, indigo headings, ink code. ---
// No side/top padding so the band spans edge-to-edge and sits flush at the very top.
const main: CSSProperties = { backgroundColor: '#FBF3DC', margin: 0, padding: '0 0 28px' }

// Just centers the content column; the parchment page is the Body itself.
const container: CSSProperties = { maxWidth: '600px', width: '100%', margin: '0 auto' }

// Gold gradient top band. backgroundColor is the Outlook fallback; backgroundImage
// is the reveal-glow gradient (gold-dark → gold → gold-light → gold).
const band: CSSProperties = {
  height: '6px',
  lineHeight: '6px',
  fontSize: '1px',
  backgroundColor: '#E8B23A',
  backgroundImage: 'linear-gradient(90deg,#C8881E 0%,#E8B23A 38%,#F6D58B 62%,#E8B23A 100%)',
}

const pad: CSSProperties = { padding: '28px 30px 30px' }

const logo: CSSProperties = { display: 'block', width: '150px', height: 'auto', border: 0, margin: '0 0 6px' }

const heading: CSSProperties = {
  margin: '6px 0 0',
  fontFamily: "'Poppins',Arial,Helvetica,sans-serif",
  fontSize: '21px',
  fontWeight: 600,
  color: '#3B3194',
}

const intro: CSSProperties = {
  margin: '8px 0 0',
  fontFamily: 'Arial,Helvetica,sans-serif',
  fontSize: '15px',
  lineHeight: '1.6',
  color: '#443f66',
}

const codeBox: CSSProperties = {
  margin: '22px 0 6px',
  backgroundColor: '#ffffff',
  border: '1px solid #d9b46a',
  borderRadius: '12px',
}

const codeText: CSSProperties = {
  margin: 0,
  padding: '22px',
  fontFamily: "'Poppins',Arial,Helvetica,sans-serif",
  fontSize: '38px',
  fontWeight: 600,
  letterSpacing: '10px',
  color: '#1C1838',
  textAlign: 'center',
}

const expiry: CSSProperties = {
  margin: '2px 0 0',
  fontFamily: 'Arial,Helvetica,sans-serif',
  fontSize: '12px',
  fontWeight: 'bold',
  color: '#C8881E',
  textAlign: 'center',
}

const fine: CSSProperties = {
  margin: '0 0 12px',
  fontFamily: 'Arial,Helvetica,sans-serif',
  fontSize: '12px',
  lineHeight: '1.5',
  color: '#5d5878',
}

const hr: CSSProperties = { borderColor: '#d9d5e8', margin: '22px 0 16px' }

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

// Inline (within-text) footer link — underlined for affordance since it sits in muted copy.
const footerLinkInline: CSSProperties = { color: '#3B3194', textDecoration: 'underline' }
