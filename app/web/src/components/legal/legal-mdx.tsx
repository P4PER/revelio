import type { MDXComponents } from 'mdx/types'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/../i18n/navigation'
import { ContactEmail } from '@/components/legal/contact-email'

type AnchorProps = { id: string }

type LastUpdatedProps = {
  /** A calendar day as YYYY-MM-DD. */
  date: string
}

type OperatorAddressProps = {
  name: string | null
  address: string | null
}

type OperatorContactProps = { email: string | null }

type OperatorDetailsProps = OperatorAddressProps & OperatorContactProps

type SiteSettingProps = { value: string | null }

type WhenSetProps = {
  value: string | null
  children: ReactNode
}

// Overrides the `long` style that `{date, date, long}` names with the same
// fields, pinned to UTC. Spelled out because `dateStyle` cannot be mixed with
// the fields of the built-in style it is merged into.
const UTC_LONG_DATE = {
  dateTime: { long: { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' } },
} as const

/**
 * Component map for legal MDX (content/legal/). Next's MDX provider,
 * src/mdx-components.tsx, gives headings, paragraphs, lists and links the docs
 * type scale; these plain elements override it so every legal page is styled
 * by ProseShell alone. Internal links still go through next-intl's Link: a bare
 * <a href="/privacy"> would drop a German reader onto the English page.
 *
 * Site settings reach a document as MDX props (`props.operatorName`, ...);
 * the components below turn a missing value into the localized fallback, so
 * no document spells "Not configured" itself.
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
  LastUpdated,
  OperatorAddress,
  OperatorContact,
  OperatorDetails,
  SiteSetting,
  WhenSet,
}

/**
 * Deep-link target placed before each section heading. rehype-slug derives
 * heading ids from the translated text, so the German page would otherwise
 * answer a German id and /terms#acceptable-use would not scroll.
 */
export function Anchor({ id }: AnchorProps) {
  return <span id={id} data-terms-anchor="" className="block scroll-mt-20" />
}

/**
 * The date a document's text last changed, closing the document. It lives in
 * the MDX rather than the page so an edit to the text and its date land in the
 * same file. The day is UTC midnight and is formatted in UTC: no time zone is
 * configured app-wide, so a server west of UTC would otherwise print the day
 * before.
 */
export function LastUpdated({ date }: LastUpdatedProps) {
  const t = useTranslations('legal')
  return (
    <p className="mt-8 text-xs text-muted-foreground/70">
      {t('lastUpdated', { date: new Date(`${date}T00:00:00Z`) }, UTC_LONG_DATE)}
    </p>
  )
}

/** Operator name and postal address as one paragraph, a line each. */
export function OperatorAddress({ name, address }: OperatorAddressProps) {
  const t = useTranslations('legal')
  const nc = t('notConfigured')
  return <p className="whitespace-pre-line">{`${name ?? nc}\n${address ?? nc}`}</p>
}

/** The labelled contact email as a mailto link. */
export function OperatorContact({ email }: OperatorContactProps) {
  const t = useTranslations('legal')
  return (
    <p>
      {t('emailLabel')} <ContactEmail email={email} fallback={t('notConfigured')} />
    </p>
  )
}

/** Address and contact together, the block the terms and privacy policy open with. */
export function OperatorDetails({ name, address, email }: OperatorDetailsProps) {
  return (
    <>
      <OperatorAddress name={name} address={address} />
      <OperatorContact email={email} />
    </>
  )
}

/** A single site setting inline in running text, e.g. the hosting provider. */
export function SiteSetting({ value }: SiteSettingProps) {
  const t = useTranslations('legal')
  return <>{value ?? t('notConfigured')}</>
}

/**
 * Renders a passage only when an optional setting is filled in. MDX keeps
 * markdown inside the element, so the passage can hold its own heading.
 */
export function WhenSet({ value, children }: WhenSetProps) {
  return value ? <>{children}</> : null
}
