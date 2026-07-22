import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendContactMessage = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/lib/contact-actions', () => ({
  sendContactMessage: (...a: unknown[]) => sendContactMessage(...a),
}))

import { ContactForm } from '../contact-form'
import en from '@/../messages/en.json'

function renderForm() {
  // renderedAt well in the past so the (client-collected) value is plausible.
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ContactForm renderedAt={Date.now() - 10_000} />
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

  it('prefills name and email from the provided defaults', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ContactForm renderedAt={Date.now() - 10_000} defaultName="Hermione" defaultEmail="h@x.io" />
      </NextIntlClientProvider>,
    )
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
})
