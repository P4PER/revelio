import type { MDXComponents } from 'mdx/types'
import type { ComponentPropsWithoutRef } from 'react'

// Docs prose deliberately reuses the type scale already set by the about and
// discord pages rather than introducing a third one.
const HEADING_2 =
  'mt-11 border-t border-border/60 pt-6 text-xl font-semibold tracking-tight text-foreground first:mt-0 first:border-t-0 first:pt-0 scroll-mt-8'
const HEADING_3 = 'mt-8 text-base font-semibold text-foreground scroll-mt-8'
const PARAGRAPH = 'mt-4 max-w-[65ch] text-sm leading-relaxed text-muted-foreground sm:text-base'
const LIST =
  'mt-4 max-w-[65ch] list-outside space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground sm:text-base'

/**
 * Next's App Router MDX convention: every compiled MDX file resolves its
 * markdown elements through this map, so a content file carries no classes.
 *
 * Links and inline code take `text-primary-ink`, not `text-primary`: the light
 * palette's primary is #F0C458, which does not pass AA as text, while
 * primary-ink (#875D0D) does.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h2: (props: ComponentPropsWithoutRef<'h2'>) => <h2 {...props} className={HEADING_2} />,
    h3: (props: ComponentPropsWithoutRef<'h3'>) => <h3 {...props} className={HEADING_3} />,
    p: (props: ComponentPropsWithoutRef<'p'>) => <p {...props} className={PARAGRAPH} />,
    ul: (props: ComponentPropsWithoutRef<'ul'>) => (
      <ul {...props} className={`${LIST} list-disc`} />
    ),
    ol: (props: ComponentPropsWithoutRef<'ol'>) => (
      <ol {...props} className={`${LIST} list-decimal`} />
    ),
    li: (props: ComponentPropsWithoutRef<'li'>) => <li {...props} className="pl-1" />,
    a: (props: ComponentPropsWithoutRef<'a'>) => (
      <a {...props} className="text-primary-ink underline underline-offset-2" />
    ),
    code: (props: ComponentPropsWithoutRef<'code'>) => (
      <code
        {...props}
        className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.86em] text-primary-ink"
      />
    ),
    // A reference table is the one thing on the page wider than the reading
    // column, so it scrolls inside its own box rather than the page body.
    table: (props: ComponentPropsWithoutRef<'table'>) => (
      <div className="mt-5 overflow-x-auto rounded-xl border border-border bg-card">
        <table {...props} className="w-full border-collapse text-sm" />
      </div>
    ),
    ...components,
  }
}
