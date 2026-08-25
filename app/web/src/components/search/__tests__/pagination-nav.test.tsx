import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/test/intl'
import { PaginationNav } from '@/components/search/pagination-nav'

describe('PaginationNav', () => {
  it('prefers a caller-supplied status over the generic record range', () => {
    renderWithIntl(
      <PaginationNav
        page={1}
        pageSize={24}
        total={105}
        status="1–24 of 105 cards"
        prevHref="?page=0"
        nextHref="?page=2"
      />,
    )
    expect(screen.getByText('1–24 of 105 cards')).toBeInTheDocument()
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument()
  })

  it('leaves announcing to the header the status came from', () => {
    renderWithIntl(
      <PaginationNav
        page={1}
        pageSize={24}
        total={105}
        status="1–24 of 105 cards"
        announcedByHeader
        nextHref="?page=2"
      />,
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps announcing a status no header repeats, as on a set page', () => {
    renderWithIntl(
      <PaginationNav page={1} pageSize={24} total={105} status="1–24 of 105 cards" nextHref="?page=2" />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('1–24 of 105 cards')
  })

  it('groups thousands in the record range', () => {
    renderWithIntl(
      <PaginationNav page={1} pageSize={24} total={14181} prevHref="?page=0" nextHref="?page=2" />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1–24 of 14,181')
  })

  it('groups thousands on both sides of the range', () => {
    renderWithIntl(
      <PaginationNav page={500} pageSize={24} total={14181} prevHref="?page=499" nextHref="?page=501" />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Showing 11,977–12,000 of 14,181')
  })
})
