import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { LessonFilterChips } from '@/components/lesson-filter-chips'

function renderChips(props: React.ComponentProps<typeof LessonFilterChips>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <LessonFilterChips {...props} />
    </NextIntlClientProvider>,
  )
}

describe('LessonFilterChips', () => {
  it('renders a chip per lesson, each with an icon and a translated label', () => {
    const { container } = renderChips({ selected: [], onToggle: () => {} })
    expect(screen.getAllByRole('button')).toHaveLength(5)
    // Icons are decorative (alt=""), so they are absent from the a11y tree —
    // count them in the DOM instead.
    expect(container.querySelectorAll('img')).toHaveLength(5)
    expect(container.querySelector('img')).toHaveAttribute('src', '/lessons/care_of_magical_creatures.svg')
    expect(screen.getByRole('button', { name: /Potions/ })).toBeInTheDocument()
  })

  it('marks selected lessons as active via aria-pressed', () => {
    renderChips({ selected: ['charms'], onToggle: () => {} })
    expect(screen.getByRole('button', { name: /Charms/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Potions/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onToggle with the lesson code on click', async () => {
    const onToggle = vi.fn()
    renderChips({ selected: [], onToggle })
    await userEvent.click(screen.getByRole('button', { name: /Potions/ }))
    expect(onToggle).toHaveBeenCalledWith('potions')
  })
})
