import type { CSSProperties } from 'react'
import { createTranslator } from 'next-intl'
import { render } from '@react-email/render'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import en from '@/../messages/en.json'

export type OtpEmailType = 'sign-in' | 'email-verification' | 'change-email'

interface OtpEmailInput {
  otp: string
  type: OtpEmailType
}

interface RenderedEmail {
  subject: string
  html: string
  text: string
}

// OTP lifetime shown to the reader — keep in sync with `expiresIn` (600s) in auth.ts.
const EXPIRY_MINUTES = 10

// Public site origin — the logo image and footer link resolve against it so the
// email works in any environment (localhost in dev, revelio.cards in prod).
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://revelio.cards'

// Copy lives in the next-intl catalog (messages/en.json → `email.otp`), read via
// createTranslator so it works outside a request/locale context (the Better Auth
// hook has none). English-only for now; wire a real locale in when available.
function otpTranslator() {
  return createTranslator({ locale: 'en', messages: en, namespace: 'email.otp' })
}

function OtpEmail({ otp, type }: OtpEmailInput) {
  const t = otpTranslator()
  return (
    <Html lang="en">
      <Head>
        <style
          dangerouslySetInnerHTML={{
            __html:
              "@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap');",
          }}
        />
      </Head>
      <Preview>{t('preview', { code: otp, minutes: EXPIRY_MINUTES })}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={pad}>
            <Img
              src={`${BASE_URL}/revelio-logo-email.png`}
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
            <Text style={fine}>
              {t('disclaimer')}
              <br />
              <Link href={BASE_URL} style={link}>
                {t('linkLabel')}
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export async function renderOtpEmail({ otp, type }: OtpEmailInput): Promise<RenderedEmail> {
  const t = otpTranslator()
  const subject = t(`subject.${type}`, { code: otp })
  const element = <OtpEmail otp={otp} type={type} />
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { subject, html, text }
}

// --- Design B ("Parchment"): light ground, gold band, indigo headings, ink code. ---
const main: CSSProperties = { backgroundColor: '#FBF3DC', margin: 0, padding: '32px 16px' }

const container: CSSProperties = {
  maxWidth: '600px',
  width: '100%',
  backgroundColor: '#FBF3DC',
  borderTop: '5px solid #E8B23A',
  borderRadius: '0 0 14px 14px',
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

const hr: CSSProperties = { borderColor: '#d9d5e8', margin: '22px 0 16px' }

const fine: CSSProperties = {
  margin: '0 0 12px',
  fontFamily: 'Arial,Helvetica,sans-serif',
  fontSize: '12px',
  lineHeight: '1.5',
  color: '#7a749b',
}

const link: CSSProperties = { color: '#3B3194' }
