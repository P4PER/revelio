// Shared shape produced by every email template renderer (renderOtpEmail,
// renderContactEmail, …): a ready-to-send subject plus HTML and plain-text bodies.
export interface RenderedEmail {
  subject: string
  html: string
  text: string
}
