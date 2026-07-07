import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { DeleteSetButton } from '../delete-set-button'

const push = vi.fn()
const del = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/set-actions', () => ({ deleteSetAction: (...a: unknown[]) => del(...a) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ push }) }))

function renderIt(cardCount: number) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DeleteSetButton code="BS" cardCount={cardCount} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => { push.mockReset(); del.mockClear() })

describe('DeleteSetButton', () => {
  it('is disabled and hints when the set has cards', () => {
    renderIt(3)
    expect(screen.getByRole('button', { name: 'Delete set' })).toBeDisabled()
    expect(screen.getByText('A set with cards cannot be deleted.')).toBeInTheDocument()
  })

  it('deletes an empty set and redirects to the list', async () => {
    renderIt(0)
    fireEvent.click(screen.getByRole('button', { name: 'Delete set' }))
    await waitFor(() => expect(del).toHaveBeenCalledWith('BS'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/sets'))
  })
})
