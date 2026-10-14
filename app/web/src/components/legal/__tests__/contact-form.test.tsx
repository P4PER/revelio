import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendContactMessage = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/lib/actions/contact-actions', () => ({
  sendContactMessage: (...a: unknown[]) => sendContactMessage(...a),
}))

import { ContactForm } from '@/components/legal/contact-form'
import { FORM_CARD } from '@/components/auth/form-card'
import en from '@/../messages/en.json'

function renderForm(props: Partial<React.ComponentProps<typeof ContactForm>> = {}) {
  // renderedAt well in the past so the (client-collected) value is plausible.
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ContactForm renderedAt={Date.now() - 10_000} intro={<h1>Intro block</h1>} {...props} />
    </NextIntlClientProvider>,
  )
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(en.contact.name), 'Hermione')
  await user.type(screen.getByLabelText(en.contact.email), 'hermione@example.com')
  await user.type(screen.getByLabelText(en.contact.subject), 'Card data typo')
  await user.type(
    screen.getByLabelText(en.contact.message),
    'The Lumos card has the wrong lesson cost listed.',
  )
}

beforeEach(() => {
  sendContactMessage.mockReset()
  sendContactMessage.mockResolvedValue({ ok: true })
})

describe('ContactForm', () => {
  it('submits valid input and shows the success message', async () => {
    const user = userEvent.setup()
    renderForm()
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: en.contact.send }))

    expect(sendContactMessage).toHaveBeenCalledTimes(1)
    expect(sendContactMessage.mock.calls[0][0]).toMatchObject({
      name: 'Hermione',
      email: 'hermione@example.com',
      subject: 'Card data typo',
    })
    expect(await screen.findByText(en.contact.successTitle)).toBeInTheDocument()
  })

  it('shows a validation error and does not submit when the message is too short', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(screen.getByLabelText(en.contact.name), 'Hermione')
    await user.type(screen.getByLabelText(en.contact.email), 'hermione@example.com')
    await user.type(screen.getByLabelText(en.contact.subject), 'Hi')
    await user.type(screen.getByLabelText(en.contact.message), 'short')
    await user.click(screen.getByRole('button', { name: en.contact.send }))

    expect(await screen.findByText(en.validation.messageTooShort)).toBeInTheDocument()
    expect(sendContactMessage).not.toHaveBeenCalled()
  })

  it('shows a placeholder hint on every visible field', () => {
    renderForm()
    for (const key of ['name', 'email', 'subject', 'message'] as const) {
      expect(screen.getByLabelText(en.contact[key])).toHaveAttribute(
        'placeholder',
        en.contact[`${key}Placeholder`],
      )
    }
  })

  it('prefills name and email from the provided defaults', () => {
    renderForm({ defaultName: 'Hermione', defaultEmail: 'h@x.io' })
    expect(screen.getByLabelText(en.contact.name)).toHaveValue('Hermione')
    expect(screen.getByLabelText(en.contact.email)).toHaveValue('h@x.io')
  })

  it('shows the rate-limit error when the action returns error:rate', async () => {
    sendContactMessage.mockResolvedValueOnce({ ok: false, error: 'rate' })
    const user = userEvent.setup()
    renderForm()
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: en.contact.send }))

    expect(await screen.findByText(en.contact.errorRate)).toBeInTheDocument()
  })

  it('surfaces a generic error when the action rejects instead of failing silently', async () => {
    sendContactMessage.mockRejectedValueOnce(new Error('boom'))
    const user = userEvent.setup()
    renderForm()
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: en.contact.send }))

    expect(await screen.findByText(en.contact.errorGeneric)).toBeInTheDocument()
  })

  it('can send another message after success (resets the form)', async () => {
    const user = userEvent.setup()
    renderForm()
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: en.contact.send }))
    await screen.findByText(en.contact.successTitle)

    await user.click(screen.getByRole('button', { name: en.contact.sendAnother }))

    // Back to a blank form ready for a second message.
    expect(screen.getByLabelText(en.contact.subject)).toHaveValue('')
    expect(screen.getByRole('button', { name: en.contact.send })).toBeInTheDocument()
  })

  it('renders the intro and footer it is given', () => {
    renderForm({ footer: <p>Footer line</p> })
    expect(screen.getByRole('heading', { name: 'Intro block' })).toBeInTheDocument()
    expect(screen.getByText('Footer line')).toBeInTheDocument()
  })

  it('wraps the form in the shared login card chrome', () => {
    const { container } = renderForm()
    const card = container.querySelector('[data-slot="contact-card"]')
    expect(card?.className).toContain(FORM_CARD)
    expect(card?.querySelector('form')).not.toBeNull()
  })

  it('shows the still emblem above the intro on small screens only', () => {
    const { container } = renderForm()
    const intro = container.querySelector('[data-slot="contact-intro"]')
    const emblem = intro?.querySelector('[data-slot="owl-post-emblem"]')
    expect(emblem).toHaveAttribute('data-state', 'still')
    expect(emblem).toHaveClass('lg:hidden')
  })

  it('keeps the honeypot out of the tab order', async () => {
    const user = userEvent.setup()
    renderForm()
    for (let i = 0; i < 6; i++) {
      await user.tab()
      expect(document.activeElement?.id).not.toBe('contact-website')
    }
  })

  it('after sending, flies the emblem over a success card and keeps the intro', async () => {
    const user = userEvent.setup()
    const { container } = renderForm()
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: en.contact.send }))
    await screen.findByText(en.contact.successTitle)

    expect(screen.getByRole('heading', { name: 'Intro block' })).toBeInTheDocument()
    const emblems = container.querySelectorAll('[data-slot="owl-post-emblem"]')
    expect(emblems).toHaveLength(1)
    expect(emblems[0]).toHaveAttribute('data-state', 'flying')
    // Clear of the card: a negative margin tucks the trail under the card's z-10 and cuts it off.
    expect(emblems[0].className.split(/\s+/).some((c) => /(^|:)-m[by]?-/.test(c))).toBe(false)
    const status = screen.getByRole('status')
    expect(status.closest('[data-slot="contact-card"]')?.className).toContain(FORM_CARD)
  })

  it('send another message resets to the signed-in prefill, not to empty', async () => {
    const user = userEvent.setup()
    renderForm({ defaultName: 'Hermione', defaultEmail: 'hermione@example.com' })
    await user.type(screen.getByLabelText(en.contact.subject), 'Card data typo')
    await user.type(screen.getByLabelText(en.contact.message), 'The Lumos card has the wrong lesson cost listed.')
    await user.click(screen.getByRole('button', { name: en.contact.send }))
    await user.click(await screen.findByRole('button', { name: en.contact.sendAnother }))

    expect(screen.getByLabelText(en.contact.name)).toHaveValue('Hermione')
    expect(screen.getByLabelText(en.contact.email)).toHaveValue('hermione@example.com')
    expect(screen.getByLabelText(en.contact.subject)).toHaveValue('')
  })

  it('centres the card against the intro and footer group from lg up', () => {
    const { container } = renderForm({ footer: <p>Footer line</p> })
    // Rows 1 and 4 are flexible spacers: the intro sits on the centre line from
    // above, the footer from below, and the card spans all four, centred.
    expect(container.querySelector('[data-slot="contact-layout"]')).toHaveClass(
      'lg:grid-rows-[1fr_auto_auto_1fr]',
    )
    expect(container.querySelector('[data-slot="contact-intro"]')).toHaveClass('lg:row-start-2')
    expect(container.querySelector('[data-slot="contact-footer"]')).toHaveClass('lg:row-start-3')
    const card = container.querySelector('[data-slot="contact-card"]')?.parentElement
    expect(card).toHaveClass('lg:row-span-4', 'lg:self-center')
  })

  it('opens the form up from lg up, where the card sits beside the intro', () => {
    const { container } = renderForm()
    expect(container.querySelector('form')).toHaveClass('space-y-4', 'lg:space-y-6')
    expect(screen.getByLabelText(en.contact.message)).toHaveClass('min-h-32', 'lg:min-h-44')
  })

  it('keeps a send error tight under the message field, not a field-gap away', async () => {
    sendContactMessage.mockResolvedValueOnce({ ok: false, error: 'rate' })
    const user = userEvent.setup()
    renderForm()
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: en.contact.send }))

    const error = await screen.findByText(en.contact.errorRate)
    // Grouped with the message field like a field's own error (login's
    // space-y-1.5), so the form's field spacing does not land above it.
    const group = error.parentElement
    expect(group).toHaveClass('space-y-1.5')
    expect(group).toContainElement(screen.getByLabelText(en.contact.message))
  })

  it('leaves the footer wrapper out entirely when there is no footer', () => {
    for (const footer of [undefined, null, '']) {
      const { container, unmount } = renderForm({ footer })
      expect(container.querySelector('[data-slot="contact-footer"]')).toBeNull()
      unmount()
    }
  })

  it('takes the card chrome without pulling in the login form module', () => {
    // auth-form.tsx is a client module carrying the OTP flow, input-otp and the
    // auth server actions; the contact bundle needs one class string from it.
    const source = readFileSync(join(__dirname, '..', 'contact-form.tsx'), 'utf8')
    expect(source).not.toMatch(/components\/auth\/auth-form/)
  })
})
