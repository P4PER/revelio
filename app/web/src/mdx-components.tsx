import type { MDXComponents } from 'mdx/types'
import type { ComponentPropsWithoutRef } from 'react'
import { Link } from '@/../i18n/navigation'
import { Callout } from '@/components/docs/callout'
import { CommandExample } from '@/components/docs/command-example'
import { CommandTable } from '@/components/docs/command-table'
import { cn } from '@/lib/utils'

// Docs prose deliberately reuses the type scale already set by the about and
// discord pages rather than introducing a third one.
const HEADING_2 =
  'mt-11 border-t border-border/60 pt-6 text-xl font-semibold tracking-tight text-foreground first:mt-0 first:border-t-0 first:pt-0 scroll-mt-8'
const HEADING_3 = 'mt-8 text-base font-semibold text-foreground scroll-mt-8'
const PARAGRAPH = 'mt-4 max-w-[65ch] text-sm leading-relaxed text-muted-foreground sm:text-base'
const LIST =
  'mt-4 max-w-[65ch] list-outside space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground sm:text-base'
const ANCHOR = 'text-primary-ink underline underline-offset-2'
const INLINE_CODE =
  'rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.86em] text-primary-ink'

// A route within the site, as opposed to an external URL or an on-page anchor.
// Only these go through next-intl's Link: routing is localePrefix 'as-needed',
// so a bare <a href="/discord"> drops a German reader onto the English page and
// lets the proxy reset their locale cookie to en.
function isInternalRoute(href: string | undefined): href is string {
  return href !== undefined && href.startsWith('/')
}

/**
 * Next's App Router MDX convention: every compiled MDX file resolves its
 * markdown elements through this map, so a content file carries no classes.
 *
 * Links and inline code take `text-primary-ink`, not `text-primary`: the light
 * palette's primary is #F0C458, which does not pass AA as text, while
 * primary-ink (#875D0D) does.
 *
 * Every override merges the incoming `className` rather than replacing it -
 * rehype hands `code` its `language-*` class, and dropping it would silence
 * any future syntax highlighting.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h2: ({ className, ...props }: ComponentPropsWithoutRef<'h2'>) => (
      <h2 {...props} className={cn(HEADING_2, className)} />
    ),
    h3: ({ className, ...props }: ComponentPropsWithoutRef<'h3'>) => (
      <h3 {...props} className={cn(HEADING_3, className)} />
    ),
    p: ({ className, ...props }: ComponentPropsWithoutRef<'p'>) => (
      <p {...props} className={cn(PARAGRAPH, className)} />
    ),
    ul: ({ className, ...props }: ComponentPropsWithoutRef<'ul'>) => (
      <ul {...props} className={cn(LIST, 'list-disc', className)} />
    ),
    ol: ({ className, ...props }: ComponentPropsWithoutRef<'ol'>) => (
      <ol {...props} className={cn(LIST, 'list-decimal', className)} />
    ),
    li: ({ className, ...props }: ComponentPropsWithoutRef<'li'>) => (
      <li {...props} className={cn('pl-1', className)} />
    ),
    a: ({ className, href, ...props }: ComponentPropsWithoutRef<'a'>) =>
      isInternalRoute(href) ? (
        <Link {...props} href={href} className={cn(ANCHOR, className)} />
      ) : (
        <a {...props} href={href} className={cn(ANCHOR, className)} />
      ),
    // MDX renders a fenced block as <pre><code class="language-x">, so the
    // inline chrome has to stay off those: the <pre> already draws the box.
    code: ({ className, ...props }: ComponentPropsWithoutRef<'code'>) => (
      <code
        {...props}
        className={cn(!className?.includes('language-') && INLINE_CODE, className)}
      />
    ),
    // A code block is as wide as its longest line, so it scrolls inside its own
    // box rather than pushing the reading column sideways.
    pre: ({ className, ...props }: ComponentPropsWithoutRef<'pre'>) => (
      <pre
        {...props}
        className={cn(
          'mt-5 overflow-x-auto rounded-xl border border-border bg-muted p-4 font-mono text-sm',
          className,
        )}
      />
    ),
    // A reference table is the one thing on the page wider than the reading
    // column, so it scrolls inside its own box rather than the page body.
    table: ({ className, ...props }: ComponentPropsWithoutRef<'table'>) => (
      <div className="mt-5 overflow-x-auto rounded-xl border border-border bg-card">
        <table {...props} className={cn('w-full border-collapse text-sm', className)} />
      </div>
    ),
    // Available to every MDX file without an import, which is the whole point
    // of MDX over plain markdown here.
    Callout,
    CommandExample,
    CommandTable,
    ...components,
  }
}
