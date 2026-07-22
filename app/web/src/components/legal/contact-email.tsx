/**
 * Renders an operator contact email as a safe `mailto:` link, or a fallback
 * string when no email is configured. Shared by the privacy and imprint pages.
 *
 * The address is percent-encoded so an unexpected character can't break the
 * URL, while `@` is kept literal for a readable href.
 */
export function ContactEmail({ email, fallback }: { email: string | null; fallback: string }) {
  if (!email) return <>{fallback}</>
  const href = `mailto:${encodeURIComponent(email).replace(/%40/g, '@')}`
  return <a href={href}>{email}</a>
}
