import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/test/intl'
import { Pagination } from '@/components/search/pagination'

describe('Pagination', () => {
  it('labels the pager with the same card range as the results header', () => {
    renderWithIntl(
      <Pagination page={1} total={105} hitsPerPage={24} current={new URLSearchParams()} />,
    )
    expect(screen.getByText('1–24 of 105 cards')).toBeInTheDocument()
  })

})
