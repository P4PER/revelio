import { describe, expect, it } from 'vitest'
import { countMessage, pageRange } from '../page-range'

describe('pageRange', () => {
  it('numbers the records a middle page covers', () => {
    expect(pageRange(2, 24, 604)).toEqual({ from: 25, to: 48, lastPage: 26 })
  })

  it('stops the last page at the total rather than a full page width', () => {
    expect(pageRange(26, 24, 604)).toEqual({ from: 601, to: 604, lastPage: 26 })
  })

  it('reports a single page when everything fits on one', () => {
    expect(pageRange(1, 24, 7)).toEqual({ from: 1, to: 7, lastPage: 1 })
  })

  it('reports a single empty page for no results', () => {
    expect(pageRange(1, 24, 0)).toEqual({ from: 0, to: 0, lastPage: 1 })
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
