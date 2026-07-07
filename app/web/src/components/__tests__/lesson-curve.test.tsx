import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import type { DeckCardView } from '@revelio/core'
import { LessonCurve } from '../lesson-curve'

const entry = (over: Partial<DeckCardView> = {}): DeckCardView => ({
  cardId: 'x', zone: 'main', quantity: 1, name: 'Card', cost: 1, setCode: 'BS', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false, ...over,
})

describe('LessonCurve', () => {
  it('always renders one bar per cost bucket (0,1,2,3,4,5+)', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <LessonCurve entries={[]} />
      </NextIntlClientProvider>,
    )
    expect(screen.getAllByTestId('curve-bar')).toHaveLength(6)
  })

  it('buckets entries by cost, folding cost >= 5 into the last bucket', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <LessonCurve
          entries={[
            entry({ cardId: 'a', cost: 0, quantity: 2 }),
            entry({ cardId: 'b', cost: 2, quantity: 3 }),
            entry({ cardId: 'c', cost: 7, quantity: 1 }),
          ]}
        />
      </NextIntlClientProvider>,
    )
    const bars = screen.getAllByTestId('curve-bar')
    expect(bars).toHaveLength(6)
    expect(bars[0]).toHaveTextContent('2')
    expect(bars[2]).toHaveTextContent('3')
    expect(bars[5]).toHaveTextContent('1')
  })
})
