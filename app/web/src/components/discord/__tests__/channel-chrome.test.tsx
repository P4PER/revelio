import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect } from 'vitest'
import en from '@/../messages/en.json'
import { ChannelHeader, MessageBox } from '@/components/discord/channel-chrome'

function renderChrome(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>,
  )
}

describe('MessageBox', () => {
  it('draws the "+" button, the command, the option pill, the value and a caret', () => {
    const { container } = renderChrome(<MessageBox command="card" option="name" value="Alohomora" />)
    const box = container.querySelector('[data-message-box]')!
    expect(box).toHaveAttribute('aria-hidden')
    expect(box.textContent).toBe('+/cardnameAlohomora')
    // The colon is a pseudo-element, so it stays out of the pill's text.
    const pill = [...box.querySelectorAll('span')].find((s) => s.textContent === 'name')!
    expect(pill.className).toMatch(/after:content-\[':'\]/)
    expect(box.querySelector('[data-caret]')!.className).toMatch(/motion-reduce:animate-none/)
  })

  // The box's flex gap spaces the caret; a negative margin pulled it flush
  // against the typed value once.
  it('leaves the caret its gap after the value', () => {
    const { container } = renderChrome(<MessageBox command="card" option="name" value="Alohomora" />)
    expect(container.querySelector('[data-caret]')!.className).not.toMatch(/(^|\s)-m[lx]-/)
  })
})

describe('ChannelHeader', () => {
  it('names the channel and its topic', () => {
    renderChrome(<ChannelHeader />)
    expect(screen.getByText(en.discord.channelName)).toBeInTheDocument()
    expect(screen.getByText(en.discord.channelTopic)).toBeInTheDocument()
  })
})
