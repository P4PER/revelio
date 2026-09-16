import type { MDXComponents } from 'mdx/types'
import type { ComponentPropsWithoutRef } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/../i18n/navigation'
import { ContactEmail } from '@/components/legal/contact-email'

type AnchorProps = { id: string }

type OperatorDetailsProps = {
  name: string | null
  address: string | null
  email: string | null
}

/**
 * Component map for legal MDX (content/legal/). Next's MDX provider,
 * src/mdx-components.tsx, gives headings, paragraphs, lists and links the docs
 * type scale; these plain elements override it so ProseShell styles a legal
 * page exactly like /privacy and /imprint. Internal links still go through
 * next-intl's Link: a bare <a href="/privacy"> would drop a German reader onto
 * the English page.
 */
export const LEGAL_COMPONENTS: MDXComponents = {
  h2: (props: ComponentPropsWithoutRef<'h2'>) => <h2 {...props} />,
  h3: (props: ComponentPropsWithoutRef<'h3'>) => <h3 {...props} />,
  p: (props: ComponentPropsWithoutRef<'p'>) => <p {...props} />,
  ul: (props: ComponentPropsWithoutRef<'ul'>) => <ul {...props} />,
  ol: (props: ComponentPropsWithoutRef<'ol'>) => <ol {...props} />,
  li: (props: ComponentPropsWithoutRef<'li'>) => <li {...props} />,
  a: ({ href, ...props }: ComponentPropsWithoutRef<'a'>) =>
    href?.startsWith('/') ? (
      <Link {...props} href={href} />
    ) : (
      <a {...props} href={href} target="_blank" rel="noopener noreferrer" />
    ),
  Anchor,
  OperatorDetails,
}

/**
 * Deep-link target placed before each section heading. rehype-slug derives
 * heading ids from the translated text, so the German page would otherwise
 * answer a German id and /terms#acceptable-use would not scroll.
 */
export function Anchor({ id }: AnchorProps) {
  return <span id={id} data-terms-anchor="" className="block scroll-mt-20" />
}

/** Operator name, address and contact email, from site settings via MDX props. */
export function OperatorDetails({ name, address, email }: OperatorDetailsProps) {
  const t = useTranslations('terms')
  const nc = t('notConfigured')
  return (
    <>
      <p className="whitespace-pre-line">{`${name ?? nc}\n${address ?? nc}`}</p>
      <p>
        {t('operatorContactLabel')} <ContactEmail email={email} fallback={nc} />
      </p>
    </>
  )
}
