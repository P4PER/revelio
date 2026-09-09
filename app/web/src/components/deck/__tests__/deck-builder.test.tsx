import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import type { SearchResult } from '@revelio/search'
import en from '@/../messages/en.json'
import type { BuilderState } from '@/lib/deck-model'
import { DeckBuilder } from '@/components/deck/deck-builder'

const EMPTY_RESULT: SearchResult = { hits: [], total: 0, page: 1, hitsPerPage: 24 }

const createDeckAction = vi.fn(async () => ({ ok: true, id: 'new-id' }))
const updateDeckAction = vi.fn(async () => ({ ok: true, id: 'existing-id' }))
const searchDeckCards = vi.fn(async (): Promise<SearchResult> => EMPTY_RESULT)
const getCardDetailAction = vi.fn(() => new Promise(() => {}))
const getCardViewsAction = vi.fn(async () => ({}))
const resolveImportNames = vi.fn(async () => ({}))
vi.mock('@/lib/actions/deck-actions', () => ({
  createDeckAction: (...a: unknown[]) => createDeckAction(...a),
  updateDeckAction: (...a: unknown[]) => updateDeckAction(...a),
  searchDeckCards: (...a: unknown[]) => searchDeckCards(...a),
  getCardDetailAction: (...a: unknown[]) => getCardDetailAction(...a),
  getCardViewsAction: (...a: unknown[]) => getCardViewsAction(...a),
  resolveImportNames: (...a: unknown[]) => resolveImportNames(...a),
}))

const push = vi.fn()
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ push }),
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// jsdom's localStorage is flaky under this test runner, and the guest-draft
// persistence itself is out of scope here — stub the localStorage-backed
// draft functions with an in-memory box so this file can focus on the
// save-on-login prompt's own logic (show/hide/accept/dismiss).
const draftBox = vi.hoisted(() => ({ current: null as BuilderState | null }))
vi.mock('@/lib/deck-model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/deck-model')>()
  return {
    ...actual,
    loadDraft: () => draftBox.current,
    saveDraft: vi.fn(),
    clearDraft: () => {
      draftBox.current = null
    },
  }
})

const emptyState: BuilderState = { name: '', format: 'revival', visibility: 'private', entries: [] }

const draftEntry = {
  cardId: 'accio', zone: 'main' as const, quantity: 2, name: 'Accio', cost: 1, setCode: 'BS', number: '1',
  lesson: null, isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false,
}

function renderBuilder(overrides: Partial<Parameters<typeof DeckBuilder>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DeckBuilder initial={emptyState} deckId={null} loggedIn={false} sets={[]} imageBase="" {...overrides} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  createDeckAction.mockClear()
  updateDeckAction.mockClear()
  push.mockClear()
  draftBox.current = null
})

describe('DeckBuilder save-on-login prompt', () => {
  it('sizes the prompt with the buttons it sits beside from md up', async () => {
    // text-xs is for the phone band, where the message shares 402px with two
    // buttons. Across the workbench it read as fine print beside them.
    draftBox.current = { name: 'My Draft', format: 'revival', visibility: 'private', entries: [draftEntry] }
    renderBuilder({ loggedIn: true, deckId: null })
    expect(await screen.findByText(en.decks.savePrompt.message)).toHaveClass('text-xs', 'md:text-sm')
  })

  it('offers to save a non-empty guest draft once the user is logged in, and saves it on accept', async () => {
    draftBox.current = { name: 'My Draft', format: 'revival', visibility: 'private', entries: [draftEntry] }
    renderBuilder({ loggedIn: true, deckId: null })

    expect(await screen.findByText('Save this deck to your account?')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Save to account' }))

    await waitFor(() => expect(createDeckAction).toHaveBeenCalledTimes(1))
    expect(createDeckAction).toHaveBeenCalledWith({
      name: 'My Draft',
      format: 'revival',
      visibility: 'private',
      cards: [{ cardId: 'accio', zone: 'main', quantity: 2 }],
    })
    expect(draftBox.current).toBeNull()
    expect(push).toHaveBeenCalledWith('/decks/new-id')
  })

  it('hides the banner on dismiss without touching the stored draft', async () => {
    draftBox.current = { name: 'My Draft', format: 'revival', visibility: 'private', entries: [draftEntry] }
    renderBuilder({ loggedIn: true, deckId: null })

    expect(await screen.findByText('Save this deck to your account?')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Not now' }))

    expect(screen.queryByText('Save this deck to your account?')).not.toBeInTheDocument()
    expect(createDeckAction).not.toHaveBeenCalled()
    expect(draftBox.current).not.toBeNull()
  })

  it('does not show the prompt when there is no draft, when logged out, or when editing an existing deck', () => {
    renderBuilder({ loggedIn: true, deckId: null })
    expect(screen.queryByText('Save this deck to your account?')).not.toBeInTheDocument()

    draftBox.current = { name: '', format: 'revival', visibility: 'private', entries: [] }
    renderBuilder({ loggedIn: true, deckId: null })
    expect(screen.queryByText('Save this deck to your account?')).not.toBeInTheDocument()

    draftBox.current = { name: 'My Draft', format: 'revival', visibility: 'private', entries: [draftEntry] }
    renderBuilder({ loggedIn: true, deckId: 'existing-id' })
    expect(screen.queryByText('Save this deck to your account?')).not.toBeInTheDocument()
  })
})


describe('DeckBuilder command bar', () => {
  // Every control stays in the one bar, which is inside the sheet on a phone
  // and spans the top of the workbench from md up - the format in particular,
  // since it picks the pool the browser searches.
  it('keeps the name, format, import and export in a single bar', () => {
    renderBuilder({ loggedIn: true })
    const bar = screen.getByLabelText(en.decks.namePlaceholder).closest('div')!
    expect(bar).toContainElement(screen.getByRole('group', { name: en.decks.format.label }))
    expect(bar).toContainElement(screen.getByRole('button', { name: en.decks.import.button }))
    expect(bar).toContainElement(screen.getByRole('button', { name: en.decks.export.button }))
  })

  it('stacks into full-width rows below md and one row from md up', () => {
    // The bar used to be a grid-cols-[1fr_auto_auto] squeezing the name, the
    // format, both transfer buttons and Save into a 322px box, where an `auto`
    // column let "Zum Speichern anmelden" decide the row: the German name got
    // clipped to "Unbenanntes D" and Export was pushed off the card's edge.
    // Inside the sheet the width is no longer contested, so the rows can be
    // honest and nothing has to yield.
    renderBuilder({ loggedIn: true })
    const bar = screen.getByLabelText(en.decks.namePlaceholder).closest('div')!
    expect(bar).toHaveClass('flex', 'flex-col', 'md:flex-row')
    expect(bar.className).not.toContain('grid-cols-[1fr_auto_auto]')

    // The name gets the whole row rather than whatever a sibling leaves over.
    expect(screen.getByLabelText(en.decks.namePlaceholder)).toHaveClass('w-full', 'min-w-0')

    // Format plus the two buttons share row two, and md:contents folds that
    // row back into the bar's own flex row on the workbench.
    const group = screen.getByRole('group', { name: en.decks.format.label })
    expect(group.parentElement).toHaveClass('flex', 'md:contents')
    expect(group.parentElement).toContainElement(
      screen.getByRole('button', { name: en.decks.export.button }),
    )
  })

  it('keeps its Save on the workbench and hands the phone a full-width one', () => {
    // Save stays in the bar where it has always been from md up. On a phone it
    // sits at the foot of the sheet instead, full width - which is what stops
    // "Zum Speichern anmelden", the longest string in the builder, from
    // squeezing the bar the way it used to.
    //
    // Two elements, because the two live in different parents and no grid
    // placement moves a node between them; only ever one is perceivable, since
    // display:none takes the other out of the a11y tree and the tab order both.
    renderBuilder({ loggedIn: true })
    const bar = screen.getByLabelText(en.decks.namePlaceholder).closest('div')!
    const saves = screen.getAllByRole('button', { name: en.decks.save })
    expect(saves).toHaveLength(2)

    const inBar = saves.find((b) => bar.contains(b))!
    const inSheet = saves.find((b) => !bar.contains(b))!
    expect(inBar).toHaveClass('hidden', 'md:inline-flex')
    expect(inSheet).toHaveClass('w-full', 'md:hidden')
  })

  it('offers the guest the same two Saves, as Log in to save', () => {
    renderBuilder({ loggedIn: false })
    const links = screen.getAllByRole('link', { name: en.decks.loginToSave })
    expect(links).toHaveLength(2)
    for (const link of links) expect(link).toHaveAttribute('href', '/login')
  })

  it('wires the format switch into the builder state', async () => {
    // Placement alone is not the feature: flipping the switch has to reach
    // BuilderState, which is what re-runs the search against the other pool.
    // The placeholder names the live format, so it doubles as the readout.
    renderBuilder()
    expect(screen.getByRole('searchbox')).toHaveAttribute(
      'placeholder',
      en.decks.browse.searchPlaceholder.replace('{format}', en.decks.format.revival),
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: en.decks.format.classic }))

    expect(screen.getByRole('searchbox')).toHaveAttribute(
      'placeholder',
      en.decks.browse.searchPlaceholder.replace('{format}', en.decks.format.classic),
    )
  })

  it('leaves every control on screen rather than behind a disclosure', () => {
    // An overflow toggle traded four rows for a hidden menu, which is worse:
    // a bare glyph that opens an inline panel reads as neither.
    renderBuilder()
    expect(screen.getByRole('group', { name: en.decks.format.label })).not.toHaveClass('hidden')
    expect(screen.getByRole('button', { name: en.decks.import.button }).parentElement).not.toHaveClass('hidden')
  })

  it('folds the import and export labels away below sm, keeping their names', () => {
    // The row only fits the format switch plus both actions once the labels
    // give way to their icons; aria-label carries the accessible name.
    renderBuilder()
    for (const label of [en.decks.import.button, en.decks.export.button]) {
      const button = screen.getByRole('button', { name: label })
      expect(button).toHaveAttribute('aria-label', label)
      expect(button.querySelector('span')).toHaveClass('max-sm:hidden')
    }
  })
})

// The sheet handle's accessible name is an ICU plural, so match the parts the
// tests are about - the label out of en.json and the live count - rather than
// pasting the rendered English back in.
const handleName = (count: number) => new RegExp(`^Deck\\b.*\\b${count}\\b`)

describe('DeckBuilder mobile deck sheet', () => {
  // Below md the two panes used to stack, which put the deck a full
  // screen-scroll under the card browser: you added a card and nothing you
  // could see changed. A segmented switch fixed that but left two bars at the
  // bottom of the browse pane and no room for the command bar. Now browsing is
  // the whole screen and the deck is a sheet that peeks a handle.
  it('opens with browsing on screen and the deck peeking a handle', () => {
    renderBuilder()
    const handle = screen.getByRole('button', { name: handleName(0) })
    expect(handle).toHaveAttribute('aria-expanded', 'false')
    expect(handle).toHaveClass('md:hidden')
  })

  it('holds the command bar, the deck and the save action inside the sheet', () => {
    // This is the whole point of the direction: the controls that could not fit
    // above a 402px card grid have somewhere roomy to live, and one command bar
    // serves both layouts instead of being rendered twice.
    const { container } = renderBuilder({ loggedIn: true })
    const handle = screen.getByRole('button', { name: handleName(0) })
    const body = document.getElementById(handle.getAttribute('aria-controls')!)!

    expect(body).toContainElement(screen.getByLabelText(en.decks.namePlaceholder))
    expect(body).toContainElement(container.querySelector('[data-pane="deck"]'))
    // Both Saves sit inside the sheet's subtree - the bar's copy included,
    // since the bar itself does - so assert on the phone's full-width one.
    const saves = screen.getAllByRole('button', { name: en.decks.save })
    expect(saves.filter((b) => body.contains(b) && b.className.includes('md:hidden'))).toHaveLength(1)
    // Browsing is the page, not part of the sheet.
    expect(body).not.toContainElement(container.querySelector('[data-pane="browse"]'))
  })

  it('opens and shuts on the handle', async () => {
    renderBuilder()
    const handle = screen.getByRole('button', { name: handleName(0) })
    const user = userEvent.setup()

    await user.click(handle)
    expect(handle).toHaveAttribute('aria-expanded', 'true')

    await user.click(handle)
    expect(handle).toHaveAttribute('aria-expanded', 'false')
  })

  it('lays both panes out side by side from md up', () => {
    // From md the sheet is display:contents, so its children become items of
    // the builder's own grid and `expanded` stops meaning anything.
    const { container } = renderBuilder()
    const browse = container.querySelector('[data-pane="browse"]')!
    expect(browse.parentElement).toHaveClass('md:grid', 'md:grid-cols-[1.15fr_0.85fr]')
    expect(container.querySelector('[data-deck-sheet]')).toHaveClass('md:contents')
    expect(browse).toHaveClass('md:col-start-1', 'md:row-start-3')
    expect(container.querySelector('[data-pane="deck"]')).toHaveClass('md:col-start-2', 'md:row-start-3')
  })

  it('counts every copy in every zone on the handle', () => {
    renderBuilder({
      initial: {
        ...emptyState,
        entries: [
          { ...draftEntry, quantity: 2 },
          { ...draftEntry, cardId: 'alohomora', name: 'Alohomora', zone: 'sideboard', quantity: 3 },
        ],
      },
    })
    expect(screen.getByRole('button', { name: handleName(5) })).toBeInTheDocument()
  })

  it('names the deck and its format on the shut handle', () => {
    // Shut, the handle is the only readout of what you are building.
    renderBuilder({ initial: { ...emptyState, name: 'Gryffindor Aggro', entries: [draftEntry] } })
    expect(screen.getByText('Gryffindor Aggro')).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`2 cards.*${en.decks.format.revival}`))).toBeInTheDocument()
  })

  it('rests the sheet flush on the bottom edge, not floating above it', () => {
    // The old switch added env(safe-area-inset-bottom) to `bottom`, but the
    // builder it sits in is already 100dvh tall less the header, and that dvh
    // stops at the top of Safari's toolbar - so the home indicator was counted
    // twice and the bar floated about 39px too high.
    const { container } = renderBuilder()
    const sheet = container.querySelector('[data-deck-sheet]')!
    expect(sheet).toHaveClass('absolute', 'bottom-0')
    expect(sheet.className).not.toContain('bottom-[')
  })

  it('isolates the browse pane only while the sheet is open', async () => {
    // Isolating stops the tiles' z-30 overlays painting over an open sheet.
    // Doing it unconditionally would also trap CardRotate, which deliberately
    // escapes to a fixed z-50 image over a z-40 dismiss backdrop: under a
    // stacking context both fall behind the shut sheet's opaque peek handle,
    // stranding a rotated card behind a band whose tap opens the sheet.
    const { container } = renderBuilder()
    const browse = container.querySelector('[data-pane="browse"]')!
    expect(browse).not.toHaveClass('max-md:isolate')

    await userEvent.setup().click(screen.getByRole('button', { name: handleName(0) }))
    expect(browse).toHaveClass('max-md:isolate')
  })

  it('reserves the peeking band under the card grid', () => {
    // Without this the last row of cards sits under the shut sheet.
    const { container } = renderBuilder()
    expect(container.querySelector('[data-pane="browse"]')).toHaveClass(
      'pb-[var(--deck-sheet-peek)]',
      'md:pb-0',
    )
  })

  it('anchors the sheet to the builder, not to the viewport', () => {
    // The band the pane reserves is padding in the page flow, so the sheet has
    // to be measured the same way or it drifts out of that band as the page
    // scrolls toward the footer. Anchoring it here also takes it off screen
    // with the builder, and the clip keeps its shut body off the footer.
    const { container } = renderBuilder()
    const shell = container.querySelector('[data-pane="browse"]')!.parentElement!
    expect(shell).toHaveClass('relative', 'overflow-hidden')
    expect(container.querySelector('[data-deck-sheet]')).toHaveClass('absolute')
  })

  it('opens the sheet for the save-on-login prompt, which lives inside it', async () => {
    // The prompt asks to save a guest draft the moment you log in. Inside a
    // shut sheet nobody would ever see it.
    draftBox.current = { name: 'My Draft', format: 'revival', visibility: 'private', entries: [draftEntry] }
    renderBuilder({ loggedIn: true, deckId: null })

    expect(await screen.findByText(en.decks.savePrompt.message)).toBeInTheDocument()
    // The same mount pass loads the draft into state, so the handle already
    // counts its two copies.
    expect(screen.getByRole('button', { name: handleName(2) })).toHaveAttribute('aria-expanded', 'true')
  })

  it('leaves no empty strip under the deck list on the workbench', () => {
    // The foot only ever holds the phone's full-width Save; from md up the
    // bar's own Save takes over, so it has nothing left to show there - and
    // rendered as an empty bordered box under the deck list.
    const { container } = renderBuilder({ loggedIn: false, deckId: null })
    expect(container.querySelector('[data-deck-sheet-foot]')).toHaveClass('md:hidden')
  })

  it("puts the save-on-login prompt on the command bar's row, not under the deck list", async () => {
    // It belongs with the Save it is about, and on the workbench that Save is
    // up in the command bar - not down in the phone's foot.
    draftBox.current = { name: 'My Draft', format: 'revival', visibility: 'private', entries: [draftEntry] }
    const { container } = renderBuilder({ loggedIn: true, deckId: null })
    await screen.findByText(en.decks.savePrompt.message)
    const prompt = container.querySelector('[data-deck-save-prompt]')!
    expect(prompt).toHaveClass('md:col-span-2', 'md:row-start-2')
    expect(container.querySelector('[data-deck-sheet-foot]')).not.toContainElement(prompt as HTMLElement)
  })

  it('never shows the draft notice and the save prompt at once, so they can share a row', async () => {
    // Both are placed on row two of the workbench grid, which only works
    // because the notice is for guests and the prompt needs a session.
    draftBox.current = { name: 'My Draft', format: 'revival', visibility: 'private', entries: [draftEntry] }
    renderBuilder({ loggedIn: true, deckId: null })
    await screen.findByText(en.decks.savePrompt.message)
    expect(screen.queryByText(en.decks.draftNotice)).not.toBeInTheDocument()
  })

  it("puts the guest's draft notice on the command bar's row, right after the foot", () => {
    // On the workbench the foot sits in the deck column, so a notice rendered
    // inside it ended up beneath the deck list; it spans the bar's own row
    // instead. Grid placement is by row, so it can still follow the foot in
    // the DOM - which is where a phone wants it, just under Save.
    const { container } = renderBuilder({ loggedIn: false, deckId: null })
    const notice = screen.getByText(en.decks.draftNotice)
    const foot = container.querySelector('[data-deck-sheet-foot]')!
    expect(notice).toHaveClass('md:col-span-2', 'md:row-start-2')
    expect(foot).not.toContainElement(notice)
    expect(foot.nextElementSibling).toBe(notice)
    // The foot hands the phone's bottom inset to the notice below it.
    expect(foot).toHaveClass('pb-2')
  })

  it('replays the badge animation on every add by keying it to the add nonce', () => {
    // The count is the only feedback an add gives while the sheet is shut.
    // Remounting the badge per add replays its enter animation, so the number
    // does not just quietly tick over.
    renderBuilder()
    const badge = screen.getByTestId('deck-sheet-count')
    expect(badge).toHaveClass('motion-safe:animate-in', 'motion-safe:zoom-in-50')
  })
})
