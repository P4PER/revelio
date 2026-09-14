import type { MDXComponents } from 'mdx/types'

// Next's App Router MDX convention: every compiled MDX file calls this to
// resolve the components it renders its markdown elements with.
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return { ...components }
}
