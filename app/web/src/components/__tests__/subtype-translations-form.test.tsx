import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { SubTypeTranslationsForm } from '../subtype-translations-form'

vi.mock('@/lib/sub-type-actions', () => ({ saveSubTypeTranslationsAction: vi.fn(async () => ({ ok: true })) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

type Row = { code: string; labels: Record<string, string> }
const defaultRows: Row[] = [
  { code: 'death_eater', labels: { de: 'Todesser' } },
  { code: 'wizard', labels: {} },
]

function renderForm(rows: Row[] = defaultRows) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SubTypeTranslationsForm locales={['en', 'de']} rows={rows} />
    </NextIntlClientProvider>,
  )
}

describe('SubTypeTranslationsForm', () => {
  it('renders a row per sub-type with existing translations prefilled', () => {
    renderForm()
    expect(screen.getByText('death_eater')).toBeInTheDocument()
    expect(screen.getByText('wizard')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Todesser')).toBeInTheDocument()
  })

  it('saves the full row×locale matrix, sending "" for cleared cells', async () => {
    const { saveSubTypeTranslationsAction } = await import('@/lib/sub-type-actions')
    const { toast } = await import('sonner')
    renderForm()

    fireEvent.change(screen.getByLabelText('death_eater de'), { target: { value: '' } }) // clear -> delete
    fireEvent.change(screen.getByLabelText('wizard en'), { target: { value: 'Wizard' } }) // add
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(saveSubTypeTranslationsAction).toHaveBeenCalled())
    expect(saveSubTypeTranslationsAction).toHaveBeenCalledWith({
      rows: [
        { code: 'death_eater', lang: 'en', label: '' },
        { code: 'death_eater', lang: 'de', label: '' },
        { code: 'wizard', lang: 'en', label: 'Wizard' },
        { code: 'wizard', lang: 'de', label: '' },
      ],
    })
    expect(toast.success).toHaveBeenCalled()
  })

  it('shows an inline error when saving fails', async () => {
    const { saveSubTypeTranslationsAction } = await import('@/lib/sub-type-actions')
    ;(saveSubTypeTranslationsAction as unknown as { mockResolvedValueOnce: (v: unknown) => void })
      .mockResolvedValueOnce({ ok: false })
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(en.admin.saveError)).toBeInTheDocument()
  })

  it('filters rows by the search query (code or translation text)', () => {
    renderForm()
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'wiz' } })
    expect(screen.getByText('wizard')).toBeInTheDocument()
    expect(screen.queryByText('death_eater')).not.toBeInTheDocument()

    // search also matches translation text
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'todes' } })
    expect(screen.getByText('death_eater')).toBeInTheDocument()
    expect(screen.queryByText('wizard')).not.toBeInTheDocument()
  })

  it('clears the search via the clear button (shown only with a query)', () => {
    renderForm()
    expect(screen.queryByRole('button', { name: /clear search/i })).not.toBeInTheDocument()
    const search = screen.getByPlaceholderText(/search/i)
    fireEvent.change(search, { target: { value: 'wiz' } })
    expect(screen.queryByText('death_eater')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /clear search/i }))
    expect((search as HTMLInputElement).value).toBe('')
    expect(screen.getByText('death_eater')).toBeInTheDocument()
  })

  it('"only untranslated" hides fully-translated rows', () => {
    renderForm([
      { code: 'death_eater', labels: { en: 'Death Eater', de: 'Todesser' } }, // complete
      { code: 'wizard', labels: { en: 'Wizard' } }, // missing de
    ])
    fireEvent.click(screen.getByRole('button', { name: /only untranslated/i }))
    expect(screen.getByText('wizard')).toBeInTheDocument()
    expect(screen.queryByText('death_eater')).not.toBeInTheDocument()
  })

  it('keeps the edited row visible while typing under "only untranslated"', () => {
    renderForm([{ code: 'wizard', labels: {} }]) // untranslated
    fireEvent.click(screen.getByRole('button', { name: /only untranslated/i }))
    expect(screen.getByText('wizard')).toBeInTheDocument()
    // filling the cells must NOT drop the row from view mid-edit
    fireEvent.change(screen.getByLabelText('wizard en'), { target: { value: 'Wizard' } })
    fireEvent.change(screen.getByLabelText('wizard de'), { target: { value: 'Zauberer' } })
    expect(screen.getByText('wizard')).toBeInTheDocument()
  })
})
