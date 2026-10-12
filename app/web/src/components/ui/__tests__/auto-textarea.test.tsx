import { afterEach, describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { Slot } from 'radix-ui'
import { AutoTextarea } from '../auto-textarea'

describe('AutoTextarea', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

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

  // jsdom has no layout, so scrollHeight and the computed max-height are stubbed
  // to put the content past (or inside) a caller's max-h cap.
  function renderSized(scrollHeight: number, maxHeight: string) {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight)
    const real = window.getComputedStyle
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
      const style = real(el)
      return Object.assign(Object.create(style), { lineHeight: '20px', maxHeight })
    })
    render(<AutoTextarea aria-label="notes" value="x" onChange={() => {}} />)
    return screen.getByLabelText('notes') as HTMLTextAreaElement
  }

  it('scrolls once the content outgrows a max-height cap', () => {
    const el = renderSized(1000, '384px')
    expect(el.style.overflowY).toBe('auto')
  })

  it('stays unscrollable while the content fits', () => {
    const el = renderSized(100, '384px')
    expect(el.style.overflowY).toBe('hidden')
  })

  it('never scrolls without a max-height cap', () => {
    const el = renderSized(1000, 'none')
    expect(el.style.overflowY).toBe('hidden')
  })
})
