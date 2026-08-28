import type { ReactElement, ReactNode } from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'
import { renderWithIntl } from '@/test/intl'
import { LessonIcons } from '@/components/deck/lesson-icons'

function renderInGerman(ui: ReactElement) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <NextIntlClientProvider locale="de" timeZone="UTC" messages={de}>{children}</NextIntlClientProvider>
  }
  return render(ui, { wrapper: Wrapper })
}

describe('LessonIcons', () => {
  it('renders one image per lesson code', () => {
    renderWithIntl(<LessonIcons codes={['charms', 'potions']} />)
    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(screen.getByAltText(en.attributes.lessons.potions)).toHaveAttribute('src', '/lessons/potions.svg')
  })

  it('caps icons and shows a +N overflow chip', () => {
    renderWithIntl(<LessonIcons codes={['charms', 'potions', 'quidditch', 'transfiguration', 'care_of_magical_creatures']} max={3} />)
    expect(screen.getAllByRole('img')).toHaveLength(3)
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('renders nothing for an empty list', () => {
    const { container } = renderWithIntl(<LessonIcons codes={[]} />)
    expect(container.querySelectorAll('img')).toHaveLength(0)
  })

  it('names the row and each symbol in the active locale', () => {
    renderInGerman(<LessonIcons codes={['potions', 'care_of_magical_creatures']} />)
    expect(screen.getByLabelText(de.decks.lessonsAria)).toBeInTheDocument()
    expect(screen.getByAltText(de.attributes.lessons.potions)).toBeInTheDocument()
    expect(screen.getByAltText(de.attributes.lessons.care_of_magical_creatures)).toBeInTheDocument()
  })
})
