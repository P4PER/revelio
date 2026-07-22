import type { CSSProperties } from 'react'
import { createTranslator } from 'next-intl'
import { render } from '@react-email/render'
import { Body, Container, Heading, Html, Section, Text } from '@react-email/components'
import en from '@/../messages/en.json'

interface ContactEmailInput {
  name: string
  email: string
  subject: string
  message: string
}

interface RenderedEmail {
  subject: string
  html: string
  text: string
}

// Operator-facing notification — English-only, mirroring renderOtpEmail. Copy lives
// in messages/en.json → `email.contact`, read via createTranslator so it works
// outside a request/locale context (server actions have none here).
function contactTranslator() {
  return createTranslator({ locale: 'en', messages: en, namespace: 'email.contact' })
}

type Translate = ReturnType<typeof contactTranslator>

function ContactEmail({ name, email, subject, message, t }: ContactEmailInput & { t: Translate }) {
  return (
    <Html lang="en">
      <Body style={main}>
        <Container style={container}>
          <Heading as="h1" style={heading}>
            {t('heading')}
          </Heading>
          <Text style={row}>
            <strong>{t('fromLabel')}:</strong> {name}
          </Text>
          <Text style={row}>
            <strong>{t('emailLabel')}:</strong> {email}
          </Text>
          <Text style={row}>
            <strong>{t('subjectLabel')}:</strong> {subject}
          </Text>
          <Text style={row}>
            <strong>{t('messageLabel')}:</strong>
          </Text>
          {/* Preserve the sender's line breaks; the message is untrusted text and is
              only ever rendered as escaped React children (no dangerouslySetInnerHTML). */}
          <Section style={messageBox}>
            <Text style={messageText}>{message}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export async function renderContactEmail(input: ContactEmailInput): Promise<RenderedEmail> {
  const t = contactTranslator()
  const subject = t('subject', { subject: input.subject })
  const element = <ContactEmail {...input} t={t} />
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { subject, html, text }
}

const main: CSSProperties = { backgroundColor: '#FBF3DC', margin: 0, padding: '24px 0' }
const container: CSSProperties = { maxWidth: '600px', width: '100%', margin: '0 auto', padding: '0 30px' }
const heading: CSSProperties = {
  fontFamily: "'Poppins',Arial,Helvetica,sans-serif",
  fontSize: '20px',
  fontWeight: 600,
  color: '#3B3194',
}
const row: CSSProperties = {
  margin: '4px 0',
  fontFamily: 'Arial,Helvetica,sans-serif',
  fontSize: '14px',
  color: '#443f66',
}
const messageBox: CSSProperties = {
  margin: '10px 0',
  backgroundColor: '#ffffff',
  border: '1px solid #d9b46a',
  borderRadius: '10px',
}
const messageText: CSSProperties = {
  margin: 0,
  padding: '16px',
  whiteSpace: 'pre-line',
  fontFamily: 'Arial,Helvetica,sans-serif',
  fontSize: '14px',
  lineHeight: '1.6',
  color: '#1C1838',
}
