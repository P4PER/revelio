import type { routing } from '@/../i18n/routing'

// Shared shape produced by every email template renderer (renderOtpEmail,
// renderContactEmail, …): a ready-to-send subject plus HTML and plain-text bodies.
export type RenderedEmail = {
  subject: string
  html: string
  text: string
}

// A locale an email can be rendered in: every locale the site routes.
export type EmailLocale = (typeof routing.locales)[number]
