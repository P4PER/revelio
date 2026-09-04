import { describe, expect, it } from 'vitest'
import { countMessage, overflowPage, pageRange } from '../page-range'

describe('pageRange', () => {
  it('numbers the records a middle page covers', () => {
    expect(pageRange(2, 24, 604)).toEqual({ from: 25, to: 48, lastPage: 26, page: 2 })
  })

  it('stops the last page at the total rather than a full page width', () => {
    expect(pageRange(26, 24, 604)).toEqual({ from: 601, to: 604, lastPage: 26, page: 26 })
  })

  it('clamps a page past the end to the last one', () => {
    // `page` comes back clamped as well as the range, so a readout can never
    // say "999 / 26" beside controls that already treat 26 as the last page.
    expect(pageRange(999, 24, 604)).toEqual({ from: 601, to: 604, lastPage: 26, page: 26 })
  })

  it('clamps a page below the first one', () => {
    expect(pageRange(0, 24, 604)).toEqual({ from: 1, to: 24, lastPage: 26, page: 1 })
  })

  it('reports a single page when everything fits on one', () => {
    expect(pageRange(1, 24, 7)).toEqual({ from: 1, to: 7, lastPage: 1, page: 1 })
  })

  it('reports a single empty page for no results', () => {
    expect(pageRange(1, 24, 0)).toEqual({ from: 0, to: 0, lastPage: 1, page: 1 })
  })
})

describe('overflowPage', () => {
  it('names the last page when the requested one is past the end', () => {
    expect(overflowPage(999, 24, 604)).toBe(26)
  })

  it('sends a high page back to the first one when nothing matched', () => {
    expect(overflowPage(5, 24, 0)).toBe(1)
  })

  it('leaves a page inside the results alone', () => {
    expect(overflowPage(26, 24, 604)).toBeNull()
    expect(overflowPage(1, 24, 7)).toBeNull()
  })
})

describe('countMessage', () => {
  it('asks for the ranged wording while the results span several pages', () => {
    expect(countMessage(2, 24, 604)).toEqual({ ranged: true, values: { from: 25, to: 48, total: 604 } })
  })

  it('asks for the plain total once everything fits on one page', () => {
    expect(countMessage(1, 24, 7)).toEqual({ ranged: false, values: { count: 7 } })
  })
})
