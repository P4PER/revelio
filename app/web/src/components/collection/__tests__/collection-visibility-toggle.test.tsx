import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/test/intl'
import { setCollectionVisibilityAction } from '@/lib/actions/collection-actions'
import { CollectionVisibilityToggle } from '@/components/collection/collection-visibility-toggle'

vi.mock('@/lib/actions/collection-actions', () => ({
  setCollectionVisibilityAction: vi.fn(async () => ({ ok: true })),
}))

const shareUrl = 'https://revelio.cards/collection/harry'

describe('CollectionVisibilityToggle', () => {
  it('offers Share on a private collection and makes it public once confirmed', async () => {
    renderWithIntl(<CollectionVisibilityToggle initial="private" shareUrl={shareUrl} />)
    expect(screen.queryByText('Shared')).not.toBeInTheDocument()

    // Clicking Share opens a confirm dialog rather than sharing at once.
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect(setCollectionVisibilityAction).not.toHaveBeenCalled()
    expect(screen.getByText('Share this collection?')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Share' }).at(-1)!)
    await waitFor(() => expect(setCollectionVisibilityAction).toHaveBeenCalledWith('public'))
    expect(await screen.findByRole('button', { name: /Shared/ })).toBeInTheDocument()
  })

  it('shows Shared on a public collection', () => {
    renderWithIntl(<CollectionVisibilityToggle initial="public" shareUrl={shareUrl} />)
    expect(screen.getByRole('button', { name: /Shared/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument()
  })

  it('uses the sm button size the deck overview actions use', () => {
    renderWithIntl(<CollectionVisibilityToggle initial="private" shareUrl={shareUrl} />)
    expect(screen.getByRole('button', { name: 'Share' })).toHaveAttribute('data-size', 'sm')
  })
})
