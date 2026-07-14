import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { DeleteUserButton } from '../delete-user-button'

const h = vi.hoisted(() => ({
  deleteUser: vi.fn(async () => ({ ok: true as const })),
  push: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@/lib/user-admin-actions', () => ({ deleteUser: h.deleteUser }))
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ push: h.push }) }))
vi.mock('sonner', () => ({ toast: { success: h.success, error: h.error } }))

const DELETE = en.admin.users.deleteAction

function renderBtn(isSelf = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DeleteUserButton userId="u2" deckCount={3} isSelf={isSelf} />
    </NextIntlClientProvider>,
  )
}

// The confirm button lives inside the alertdialog; the trigger shares its name.
async function clickConfirm() {
  const dialog = await screen.findByRole('alertdialog')
  fireEvent.click(within(dialog).getByRole('button', { name: DELETE }))
}

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset())
  h.deleteUser.mockResolvedValue({ ok: true })
})

describe('DeleteUserButton', () => {
  it('is disabled on your own account', () => {
    renderBtn(true)
    expect(screen.getByRole('button', { name: DELETE })).toBeDisabled()
  })

  it('confirms, calls the action, and redirects to the list on success', async () => {
    renderBtn(false)
    fireEvent.click(screen.getByRole('button', { name: DELETE }))
    await clickConfirm()
    await waitFor(() => expect(h.deleteUser).toHaveBeenCalledWith('u2'))
    await waitFor(() => expect(h.push).toHaveBeenCalledWith('/admin/users'))
  })

  it('toasts the last-admin error and does not redirect', async () => {
    h.deleteUser.mockResolvedValueOnce({ ok: false, error: 'last-admin' })
    renderBtn(false)
    fireEvent.click(screen.getByRole('button', { name: DELETE }))
    await clickConfirm()
    await waitFor(() => expect(h.error).toHaveBeenCalledWith(en.admin.users.lastAdminError))
    expect(h.push).not.toHaveBeenCalled()
  })
})
