import type { ReactElement, ReactNode } from 'react'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../messages/en.json'
import { FORMATS } from '../../i18n/formats'

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages} formats={FORMATS}>
      {children}
    </NextIntlClientProvider>
  )
}

// Passed as `wrapper` rather than wrapped inline so `rerender` keeps the
// provider: re-rendering a bare element would swap the whole tree and remount
// the component under test, quietly resetting the state a rerender is meant to
// preserve.
export function renderWithIntl(ui: ReactElement) {
  return render(ui, { wrapper: Wrapper })
}
