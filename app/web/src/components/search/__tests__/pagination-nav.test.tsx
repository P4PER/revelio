import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/test/intl'
import { PaginationNav } from '@/components/search/pagination-nav'

describe('PaginationNav', () => {
  it('groups thousands in the record range', () => {
    renderWithIntl(
      <PaginationNav page={1} pageSize={24} total={14181} prevHref="?page=0" nextHref="?page=2" />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1–24 of 14,181')
  })
})
