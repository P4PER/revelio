import { it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { DiscordMark } from '../discord-mark'

// The row paints the mark white on the blurple tile and dark on the gold Link
// button, so it must inherit rather than carry its own fill.
it('inherits its colour from the surrounding text', () => {
  const { container } = render(<DiscordMark />)
  expect(container.querySelector('svg')).toHaveAttribute('fill', 'currentColor')
})

// The tile sizes it at size-6; inside a Button the shadcn base class sizes it
// at size-4 only while no size- class is present, so className must stay
// optional and must land on the svg when given.
it('takes the size class the caller passes', () => {
  const { container } = render(<DiscordMark className="size-6" />)
  expect(container.querySelector('svg')).toHaveClass('size-6')
})

// Decorative: the row already prints the word "Discord" right beside it.
it('is hidden from assistive technology', () => {
  const { container } = render(<DiscordMark />)
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
})
