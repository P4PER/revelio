import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import messages from '@/../messages/en.json'
import { DeckExportMenu } from '@/components/deck/deck-export-menu'
import type { BuilderState } from '@/lib/deck-model'

const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(), error: (...a: unknown[]) => toastError(...a),
    loading: vi.fn(() => 'toast-id'), dismiss: vi.fn(),
  },
}))

const state: BuilderState = {
  name: 'Charms Aggro', format: 'classic', visibility: 'private',
  entries: [{
    cardId: 'harry', zone: 'character', quantity: 1, name: 'Harry Potter', cost: null,
    damage: null, setCode: 'base', number: '1', lesson: null, isOfficial: true,
    legality: 'legal', isLesson: false, isStartingCharacter: true, imageVersion: 1,
    artCropVersion: null, orientation: null, types: ['character'],
  }],
}

// jsdom has no object URLs; the download path needs both halves.
const originalCreate = URL.createObjectURL
const originalRevoke = URL.revokeObjectURL
const downloads: string[] = []

function renderMenu() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DeckExportMenu state={state} />
    </NextIntlClientProvider>,
  )
}

async function clickPng() {
  await userEvent.click(screen.getByRole('button', { name: messages.decks.export.button }))
  await userEvent.click(await screen.findByRole('menuitem', { name: messages.decks.export.png }))
}

beforeEach(() => {
  // jsdom cannot navigate to a blob URL; record the download instead.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download)
  })
  downloads.length = 0
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  URL.createObjectURL = originalCreate
  URL.revokeObjectURL = originalRevoke
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('DeckExportMenu PNG export', () => {
  it('posts ids, zones and quantities - never the painted fields', async () => {
    const fetchMock = vi.fn(async () => new Response('png', {
      status: 200, headers: { 'content-type': 'image/png' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    renderMenu()
    await clickPng()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/deck-sheet')
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Charms Aggro', format: 'classic', locale: 'en',
      cards: [{ cardId: 'harry', zone: 'character', quantity: 1 }],
    })
    await waitFor(() => expect(downloads).toEqual(['charms-aggro.png']))
    expect(toastError).not.toHaveBeenCalled()
  })

  it('shows the error toast when the route refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 502 })))
    renderMenu()
    await clickPng()
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(messages.decks.export.pngError))
  })
})
