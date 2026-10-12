import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { Slot } from 'radix-ui'
import { AutoTextarea } from '../auto-textarea'

describe('AutoTextarea', () => {
  it('renders a controlled textarea and forwards changes', () => {
    const onChange = vi.fn()
    render(<AutoTextarea aria-label="notes" value="hello" onChange={onChange} />)
    const el = screen.getByLabelText('notes') as HTMLTextAreaElement
    expect(el.value).toBe('hello')
    fireEvent.change(el, { target: { value: 'hello world' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('forwards a ref to the textarea', () => {
    const ref = createRef<HTMLTextAreaElement>()
    render(<AutoTextarea aria-label="notes" value="" onChange={() => {}} ref={ref} />)
    expect(ref.current).toBe(screen.getByLabelText('notes'))
  })

  it('still attaches to the DOM node when rendered as a Radix Slot child', () => {
    // shadcn's <FormControl> is a Slot, and react-hook-form needs the node to
    // focus a field with an error.
    const ref = createRef<HTMLTextAreaElement>()
    render(
      <Slot.Root ref={ref}>
        <AutoTextarea aria-label="notes" value="" onChange={() => {}} />
      </Slot.Root>,
    )
    expect(ref.current).toBe(screen.getByLabelText('notes'))
  })

  // jsdom has no layout, so the sizing itself is the browser's (checked by
  // hand in Chromium, WebKit and Firefox); these pin the CSS that asks for it.
  it('lets the browser size the box and scroll past a caller cap', () => {
    render(<AutoTextarea aria-label="notes" value="" onChange={() => {}} className="max-h-96" />)
    const el = screen.getByLabelText('notes')
    expect(el).toHaveClass('field-sizing-content', 'overflow-y-auto', 'max-h-96')
    expect(el).not.toHaveClass('overflow-hidden')
  })

  it('never writes an inline height while typing', () => {
    // Resetting height per keystroke collapsed the box to its min-height and
    // made the scrolling deck import Sheet jump.
    render(<AutoTextarea aria-label="notes" value="a" onChange={() => {}} />)
    const el = screen.getByLabelText('notes') as HTMLTextAreaElement
    fireEvent.change(el, { target: { value: 'a\nb\nc' } })
    expect(el.style.height).toBe('')
  })
})
