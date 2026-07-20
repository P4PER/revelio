export type OtpEmailType = 'sign-in' | 'email-verification' | 'forget-password'

interface OtpEmailInput {
  otp: string
  type: OtpEmailType
}

interface RenderedEmail {
  subject: string
  html: string
  text: string
}

const HEADING: Record<OtpEmailType, string> = {
  'sign-in': 'Confirm it’s you',
  'email-verification': 'Verify your email',
  'forget-password': 'Reset your password',
}

const INTRO: Record<OtpEmailType, string> = {
  'sign-in': 'Enter this code to finish signing in to Revelio. It works once and only for you.',
  'email-verification': 'Enter this code to verify your email address. It works once and only for you.',
  'forget-password': 'Enter this code to reset your Revelio password. It works once and only for you.',
}

const SUBJECT: Record<OtpEmailType, string> = {
  'sign-in': 'sign-in code',
  'email-verification': 'verification code',
  'forget-password': 'password reset code',
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      default: return '&#39;'
    }
  })
}

export function renderOtpEmail({ otp, type }: OtpEmailInput): RenderedEmail {
  const code = escapeHtml(otp)
  const heading = HEADING[type]
  const intro = INTRO[type]
  const subject = `${otp} is your Revelio ${SUBJECT[type]}`

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${subject}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap');</style>
</head>
<body style="margin:0;padding:0;background:#FBF3DC;">
<span style="display:none!important;opacity:0;color:#FBF3DC;height:0;width:0;overflow:hidden;">Your Revelio code is ${code}. It expires in 10 minutes.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF3DC;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FBF3DC;border-radius:14px;overflow:hidden;">
<tr><td style="height:5px;background:#E8B23A;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:28px 30px 6px;font-family:'Poppins',Arial,Helvetica,sans-serif;font-size:22px;font-weight:600;color:#3B3194;letter-spacing:-0.4px;">revelio</td></tr>
<tr><td style="padding:6px 30px 0;font-family:'Poppins',Arial,Helvetica,sans-serif;font-size:21px;font-weight:600;color:#3B3194;">${heading}</td></tr>
<tr><td style="padding:8px 30px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#443f66;">${intro}</td></tr>
<tr><td style="padding:22px 30px 6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #d9b46a;border-radius:12px;">
<tr><td align="center" style="padding:22px;font-family:'Poppins',Arial,Helvetica,sans-serif;font-size:38px;font-weight:600;letter-spacing:10px;color:#1C1838;">${code}</td></tr>
</table>
</td></tr>
<tr><td align="center" style="padding:2px 30px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;color:#C8881E;">Expires in 10 minutes</td></tr>
<tr><td style="padding:22px 30px 0;"><div style="height:1px;background:#d9d5e8;font-size:0;line-height:0;">&nbsp;</div></td></tr>
<tr><td style="padding:16px 30px 30px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#7a749b;">
Didn’t try to sign in? You can safely ignore this email — no one can get in without the code.<br><br>
Revelio is an unofficial fan project for the Harry Potter Trading Card Game (2001, WotC).<br>
<a href="https://revelio.cards" style="color:#3B3194;">revelio.cards</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  const text = `${heading}

${intro}

${otp}

This code expires in 10 minutes and can be used once.

Didn't try to sign in? You can safely ignore this email — no one can get in without the code.

Revelio is an unofficial fan project for the Harry Potter Trading Card Game (2001, WotC).
https://revelio.cards`

  return { subject, html, text }
}
