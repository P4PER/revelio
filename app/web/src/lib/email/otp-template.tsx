import type { CSSProperties } from 'react'
import { createTranslator } from 'next-intl'
import { render } from '@react-email/render'
import { Heading, Hr, Section, Text } from '@react-email/components'
import en from '@/../messages/en.json'
import { EmailLayout, emailHeading, emailText } from './layout'
import type { RenderedEmail } from './types'

export type OtpEmailType = 'sign-in' | 'email-verification' | 'change-email' | 'delete-account'

type OtpEmailInput = {
  otp: string
  type: OtpEmailType
  contactEmail: string
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
  return (
    <EmailLayout
      locale="en"
      preview={t('preview', { code: otp, minutes: EXPIRY_MINUTES })}
      contactEmail={contactEmail}
    >
      <Heading as="h1" style={emailHeading}>
        {t(`heading.${type}`)}
      </Heading>
      <Text style={emailText}>{t(`intro.${type}`)}</Text>

      <Section style={codeBox}>
        <Text style={codeText}>{otp}</Text>
      </Section>
      <Text style={expiry}>{t('expiry', { minutes: EXPIRY_MINUTES })}</Text>

      <Hr style={hr} />
      <Text style={fine}>{t('reassurance')}</Text>
    </EmailLayout>
  )
}

export async function renderOtpEmail({ otp, type, contactEmail }: OtpEmailInput): Promise<RenderedEmail> {
  const t = otpTranslator()
  const subject = t(`subject.${type}`, { code: otp })
  const element = <OtpEmail otp={otp} type={type} contactEmail={contactEmail} t={t} />
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { subject, html, text }
}

// Content styles specific to the code email; the chrome lives in ./layout.
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
