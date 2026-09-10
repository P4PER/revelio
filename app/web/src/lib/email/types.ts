// Shared shape produced by every email template renderer (renderOtpEmail,
// renderContactEmail, …): a ready-to-send subject plus HTML and plain-text bodies.
export type RenderedEmail = {
  subject: string
  html: string
  text: string
}
