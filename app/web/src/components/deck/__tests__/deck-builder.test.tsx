import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import type { DeckBrowseResult } from '@/lib/search-projections'
import en from '@/../messages/en.json'
import type { BuilderState } from '@/lib/deck-model'
import { toast } from 'sonner'
import { toastRemoved } from '@/components/ui/sonner'
import { DeckBuilder } from '@/components/deck/deck-builder'

const EMPTY_RESULT: DeckBrowseResult = { hits: [], total: 0, page: 1, hitsPerPage: 24 }

const createDeckAction = vi.fn(async () => ({ ok: true, id: 'new-id' }))
const updateDeckAction = vi.fn(async () => ({ ok: true, id: 'existing-id' }))
const searchDeckCards = vi.fn(async (): Promise<DeckBrowseResult> => EMPTY_RESULT)
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
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() } }))
vi.mock('@/components/ui/sonner', () => ({ toastRemoved: vi.fn(() => 'removed-toast') }))

// jsdom's localStorage is flaky under this test runner, and the guest-draft
// persistence itself is out of scope here — stub the localStorage-backed
// draft functions with an in-memory box so this file can focus on the
// save-on-login prompt's own logic (show/hide/accept/dismiss).
const draftBox = vi.hoisted(() => ({ current: null as BuilderState | null }))
vi.mock('@/lib/deck-model', async (importOriginal) => {
  // Vitest's documented importOriginal form: the module's shape is only reachable as an
  // inline type here, which consistent-type-imports otherwise forbids.
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
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
  searchDeckCards.mockResolvedValue(EMPTY_RESULT)
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
     expect(toast.success).toHaveBeenCalledWith('Deck saved.', {
      description: '\u201cMy Draft\u201d is safe in your decks.',
    })
  })

  it('tells a user whose session ended how to keep their changes', async () => {
    createDeckAction.mockResolvedValueOnce({ ok: false, error: 'auth' } as never)
    draftBox.current = { name: 'My Draft', format: 'revival', visibility: 'private', entries: [draftEntry] }
    renderBuilder({ loggedIn: true, deckId: null })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Save to account' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Could not save the deck.', {
        description: 'Your changes are still here. Sign in again in a new tab, then save.',
      }),
    )
  })

  it('clamps an over-long draft name to the deck name bound on save', async () => {
    draftBox.current = { name: 'n'.repeat(300), format: 'revival', visibility: 'private', entries: [draftEntry] }
    renderBuilder({ loggedIn: true, deckId: null })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Save to account' }))
    await waitFor(() => expect(createDeckAction).toHaveBeenCalledTimes(1))
    expect(createDeckAction).toHaveBeenCalledWith(expect.objectContaining({ name: 'n'.repeat(120) }))
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

  it('lays both panes out side by side from md up', () => {
    // From md the sheet is display:contents, so its children become items of
    // the builder's own grid and `expanded` stops meaning anything.
    const { container } = renderBuilder()
    const browse = container.querySelector('[data-pane="browse"]')!
    expect(browse.parentElement).toHaveClass('md:grid', 'md:grid-cols-[1.15fr_0.85fr]')
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

  it('replays the badge animation on every add by keying it to the add nonce', async () => {
    // The count is the only feedback an add gives while the sheet is shut.
    // Remounting the badge per add replays its enter animation, so the number
    // does not just quietly tick over.
    searchDeckCards.mockResolvedValue({
      hits: [{
        id: 'ok-card', setCode: 'BS', number: '001', name: 'OK Card', types: ['spell'], subTypes: [],
        lesson: 'charms', legality: 'legal', cost: 2, damage: null, isOfficial: true, orientation: null,
        imageLang: null, imageVersion: null, artCropVersion: null, defaultLanguage: 'en',
      }],
      total: 1, page: 1, hitsPerPage: 24,
    })
    renderBuilder()
    const before = screen.getByTestId('deck-sheet-count')
    expect(before).toHaveClass('motion-safe:animate-in', 'motion-safe:zoom-in-50')

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add OK Card' }))
    await user.click(await screen.findByRole('menuitem', { name: en.decks.browse.addToMain }))

    await waitFor(() => expect(screen.getByTestId('deck-sheet-count')).not.toBe(before))
  })
})

describe('DeckBuilder with two starting characters', () => {
  // Only a deck saved, or a draft imported, before the one-character rule
  // can hold two; the server now refuses it, so the builder says why.
  const harry = { ...draftEntry, cardId: 'harry', zone: 'character' as const, quantity: 1, name: 'Harry', isStartingCharacter: true }
  const ron = { ...harry, cardId: 'ron', name: 'Ron' }
  const twoChars: BuilderState = { ...emptyState, name: 'Old deck', entries: [harry, ron] }

  it('names the rule instead of sending a save the server refuses', async () => {
    vi.mocked(toast.error).mockClear()
    renderBuilder({ loggedIn: true, deckId: 'd1', initial: twoChars })
    await userEvent.setup().click(screen.getAllByRole('button', { name: en.decks.save })[0])
    expect(toast.error).toHaveBeenCalledWith(en.decks.saveTwoCharacters)
    expect(updateDeckAction).not.toHaveBeenCalled()
  })

  it('does the same for a guest draft saved to the account', async () => {
    vi.mocked(toast.error).mockClear()
    draftBox.current = twoChars
    renderBuilder({ loggedIn: true, deckId: null })
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Save to account' }))
    expect(toast.error).toHaveBeenCalledWith(en.decks.saveTwoCharacters)
    expect(createDeckAction).not.toHaveBeenCalled()
    expect(draftBox.current).toEqual(twoChars)
  })

  it('saves an older character line of quantity 2 as the one card it is', async () => {
    // Before the one-character rule, an import merged a repeated character
    // line into one row of quantity 2; the server now takes only 1.
    renderBuilder({ loggedIn: true, deckId: 'd1', initial: { ...emptyState, name: 'Old deck', entries: [{ ...harry, quantity: 2 }] } })
    await userEvent.setup().click(screen.getAllByRole('button', { name: en.decks.save })[0])
    await waitFor(() => expect(updateDeckAction).toHaveBeenCalledTimes(1))
    expect(updateDeckAction).toHaveBeenCalledWith('d1', expect.objectContaining({ cards: [{ cardId: 'harry', zone: 'character', quantity: 1 }] }))
  })
})

describe('DeckBuilder removing the starting character', () => {
  const harry = { ...draftEntry, cardId: 'harry', zone: 'character' as const, quantity: 1, name: 'Harry Potter', isStartingCharacter: true }
  const deck: BuilderState = { ...emptyState, name: 'Gryffindor', entries: [harry, draftEntry] }

  it('empties the slot and offers an Undo that puts the card back', async () => {
    const user = userEvent.setup()
    vi.mocked(toastRemoved).mockClear()
    renderBuilder({ initial: deck })
    await user.click(screen.getByRole('button', { name: 'Remove Harry Potter as starting character' }))
    expect(screen.getByText('No starting character chosen yet.')).toBeInTheDocument()

    const [title, options] = vi.mocked(toastRemoved).mock.calls[0]
    expect(title).toBe('Starting character removed.')
    expect(options?.description).toBe('Harry Potter is out of the deck.')
    const action = options?.action as { label: string; onClick: () => void }
    expect(action.label).toBe('Undo')
    act(() => action.onClick())
    expect(screen.queryByText('No starting character chosen yet.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Remove Harry Potter as starting character' })).toBeInTheDocument()
  })

  function undoOf(call: number) {
    return vi.mocked(toastRemoved).mock.calls[call][1]?.action as { onClick: () => void }
  }

  it('keeps the other character of an imported pair through an Undo, in its place', async () => {
    const user = userEvent.setup()
    vi.mocked(toastRemoved).mockClear()
    const ron = { ...harry, cardId: 'ron', name: 'Ron Weasley' }
    renderBuilder({ initial: { ...deck, entries: [harry, ron, draftEntry] } })
    await user.click(screen.getByRole('button', { name: 'Remove Harry Potter as starting character' }))
    act(() => undoOf(0).onClick())
    expect(screen.getAllByRole('button', { name: /as starting character/ }).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Remove Harry Potter as starting character',
      'Remove Ron Weasley as starting character',
    ])
  })

  it('restores nothing once the slot has changed since the removal', async () => {
    const user = userEvent.setup()
    vi.mocked(toastRemoved).mockClear()
    const ron = { ...harry, cardId: 'ron', name: 'Ron Weasley' }
    renderBuilder({ initial: { ...deck, entries: [harry, ron, draftEntry] } })
    await user.click(screen.getByRole('button', { name: 'Remove Harry Potter as starting character' }))
    await user.click(screen.getByRole('button', { name: 'Remove Ron Weasley as starting character' }))
    act(() => undoOf(0).onClick())
    expect(screen.getByText('No starting character chosen yet.')).toBeInTheDocument()
  })

  it('closes the toast once its Undo has nothing left to restore', async () => {
    const user = userEvent.setup()
    vi.mocked(toastRemoved).mockClear()
    vi.mocked(toast.dismiss).mockClear()
    const ron = { ...harry, cardId: 'ron', name: 'Ron Weasley' }
    renderBuilder({ initial: { ...deck, entries: [harry, ron, draftEntry] } })
    await user.click(screen.getByRole('button', { name: 'Remove Harry Potter as starting character' }))
    expect(toast.dismiss).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Remove Ron Weasley as starting character' }))
    expect(toast.dismiss).toHaveBeenCalledTimes(1)
    act(() => undoOf(1).onClick())
    expect(toast.dismiss).toHaveBeenCalledTimes(2)
  })

  it('closes the toast when an import replaces the deck', async () => {
    const user = userEvent.setup()
    vi.mocked(toast.dismiss).mockClear()
    renderBuilder({ initial: deck })
    await user.click(screen.getByRole('button', { name: 'Remove Harry Potter as starting character' }))
    await user.click(screen.getAllByRole('button', { name: en.decks.import.button })[0])
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.change(dialog.getByLabelText(en.decks.import.pasteLabel), {
      target: { value: '{"name":"Other","format":"revival","character":null,"main":[],"sideboard":[]}' },
    })
    await user.click(dialog.getByRole('button', { name: en.decks.import.submit }))
    await waitFor(() => expect(toast.dismiss).toHaveBeenCalledWith('removed-toast'))
  })

  it('dismisses its toast when the builder goes away', async () => {
    const user = userEvent.setup()
    vi.mocked(toast.dismiss).mockClear()
    const { unmount } = renderBuilder({ initial: deck })
    await user.click(screen.getByRole('button', { name: 'Remove Harry Potter as starting character' }))
    unmount()
    expect(toast.dismiss).toHaveBeenCalledWith('removed-toast')
  })
})
