import type { ChangeEvent } from 'react'
import { Search } from 'lucide-react'
import { KbdHint } from '@/components/ui/kbd-hint'

// Shared chrome for the header search box. `HeaderSearch` needs
// `useSearchParams`, which suspends on every route that does not resolve its
// search params eagerly, so the shell streams first and the field arrives a
// frame later. Rendering the exact same pixels in the Suspense fallback makes
// that swap invisible instead of a pop-in.
//
// Typography sits with the inline nav links (font-medium, size-4 icon at 70%
// opacity) so the whole header row reads as one set of controls, with the query
// text one notch up from the nav's text-sm - 15px, on the same 20px leading -
// so the field reads as the header's primary control.
export const HEADER_SEARCH_CLASS = 'relative w-full min-w-0 max-w-md'

export function HeaderSearchField({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string
  // Omitted by the fallback below, which renders the same field inert.
  value?: string
  onChange?: (value: string) => void
}) {
  return (
    <>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-0 size-4 -translate-y-1/2 opacity-70"
      />
      <input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        // Only the live field answers the "/" hotkey. SearchHotkey focuses
        // whatever carries this attribute and swallows the key once focus
        // lands, so pointing it at the inert stand-in would eat a "/" and then
        // drop the focus when the real field streams in.
        data-search-hotkey={onChange ? true : undefined}
        {...(onChange
          ? {
              value: value ?? '',
              onChange: (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
            }
          : { defaultValue: '', readOnly: true })}
        className="peer h-8 w-full rounded-none border-0 border-b border-input bg-transparent pr-3 pl-6 text-[0.9375rem]/5 font-medium text-foreground outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden sm:pr-10"
      />
      {/* Reveal-glow: a gold underline that wipes in on focus / while querying. */}
      <span className="pointer-events-none absolute inset-x-0 -bottom-px h-px origin-left scale-x-0 bg-gradient-to-r from-primary to-primary/20 transition-transform duration-300 peer-focus:scale-x-100 peer-[:not(:placeholder-shown)]:scale-x-100" />
      <KbdHint shortcut="slash" className="absolute top-1/2 right-0 -translate-y-1/2" />
    </>
  )
}

// Server-rendered stand-in while `HeaderSearch` streams in. Safe to always
// render: the one route that hides the header search (home, which has its own
// hero search) is force-dynamic, so its boundary never suspends.
export function HeaderSearchFallback({ placeholder }: { placeholder: string }) {
  return (
    <div role="search" className={HEADER_SEARCH_CLASS}>
      <HeaderSearchField placeholder={placeholder} />
    </div>
  )
}
