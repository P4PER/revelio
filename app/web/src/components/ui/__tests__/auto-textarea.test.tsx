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

  it('composes a forwarded ref with its internal auto-grow ref', () => {
    const ref = createRef<HTMLTextAreaElement>()
    render(<AutoTextarea aria-label="notes" value="" onChange={() => {}} ref={ref} />)
    expect(ref.current).toBe(screen.getByLabelText('notes'))
  })

  it('still attaches to the DOM node when rendered as a Radix Slot child', () => {
    // shadcn's <FormControl> is a Slot; this is the arrangement that used to
    // clobber the internal ref and break growth. The internal ref is private,
    // so assert via the composed forwarded ref that the node is reachable.
    const ref = createRef<HTMLTextAreaElement>()
    render(
      <Slot.Root ref={ref}>
        <AutoTextarea aria-label="notes" value="" onChange={() => {}} />
      </Slot.Root>,
    )
    expect(ref.current).toBe(screen.getByLabelText('notes'))
  })
})
