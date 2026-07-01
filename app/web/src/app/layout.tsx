import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'revelio.cards',
  description: 'A searchable Harry Potter TCG card database.',
}

// The <html>/<body> live in the [locale] layout so `lang` reflects the locale.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children
}
