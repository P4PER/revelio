import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/test/intl'
import { ResultCount } from '@/components/search/result-count'

describe('ResultCount', () => {
  it('names the records on screen when the results span several pages', () => {
    renderWithIntl(<ResultCount page={2} pageSize={24} total={604} />)
    expect(screen.getByRole('status')).toHaveTextContent('25–48 of 604 cards')
  })

  it('groups thousands in the total', () => {
    renderWithIntl(<ResultCount page={1} pageSize={24} total={14181} />)
    expect(screen.getByRole('status')).toHaveTextContent('1–24 of 14,181 cards')
  })

  it('drops the range when everything fits on a single page', () => {
    renderWithIntl(<ResultCount page={1} pageSize={24} total={7} />)
    expect(screen.getByRole('status')).toHaveTextContent('7 cards')
  })

  it('drops the range for an empty result set', () => {
    renderWithIntl(<ResultCount page={1} pageSize={24} total={0} />)
    expect(screen.getByRole('status')).toHaveTextContent('0 cards')
  })
})
