import { notFound } from 'next/navigation'

// Catch-all so unmatched pathnames within the [locale] segment render the
// localized not-found page instead of Next.js's built-in 404. Real routes take
// precedence; only genuinely unknown paths (e.g. /en/unknown) reach this.
export default function CatchAllPage() {
  notFound()
}
