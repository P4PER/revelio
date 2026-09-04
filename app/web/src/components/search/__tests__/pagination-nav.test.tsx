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
        nextHref="?page=2"
      />,
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })


  it('drops the status slot entirely for a caller that owns the count', () => {
    // The deck builder's browse pane shows the count in its own live region in
    // the toolbar row and puts the pager beside it. Rendering the default range
    // here would print the same sentence twice in one row.
    renderWithIntl(
      <PaginationNav page={2} pageSize={30} total={1098} status={null} onPrev={() => {}} onNext={() => {}} />,
    )
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
  })

  it('folds the labels to chevrons below md and adds a page readout', () => {
    // One button per direction at every width - the label gives way to an icon
    // rather than a second control appearing - and aria-label keeps the name.
    renderWithIntl(
      <PaginationNav
        page={2}
        pageSize={30}
        total={1098}
        status={null}
        compactLabel
        onPrev={() => {}}
        onNext={() => {}}
      />,
    )
    for (const name of ['Previous', 'Next']) {
      const button = screen.getByRole('button', { name })
      expect(button).toHaveAttribute('aria-label', name)
      expect(button.querySelector('span')).toHaveClass('max-md:hidden')
      expect(button.querySelector('svg')).toHaveClass('md:hidden')
    }
    // 1098 / 30 = 37 pages, and the readout is the only thing that still says
    // which one you are on once the labels are folded away.
    expect(screen.getByText('2 / 37')).toHaveClass('md:hidden')
  })

  it('leaves the labelled pair alone without compactLabel', () => {
    renderWithIntl(
      <PaginationNav page={2} pageSize={30} total={1098} status={null} onPrev={() => {}} onNext={() => {}} />,
    )
    expect(screen.getByRole('button', { name: 'Next' }).querySelector('svg')).toBeNull()
    expect(screen.queryByText('2 / 37')).not.toBeInTheDocument()
  })

  it('shows the clamped page in the compact readout, never the requested one', () => {
    // Nothing upstream knows the page count early enough to clamp a URL, so a
    // caller can arrive on ?page=999 of 37. The buttons already reflect the
    // last page; the readout must not contradict them.
    renderWithIntl(
      <PaginationNav
        page={999}
        pageSize={30}
        total={1098}
        status={null}
        compactLabel
        onPrev={() => {}}
        onNext={() => {}}
      />,
    )
    expect(screen.getByText('37 / 37')).toBeInTheDocument()
    expect(screen.queryByText('999 / 37')).not.toBeInTheDocument()
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
