// Augments @types/mdx, which types only an MDX file's default export and says
// so: plugin-injected exports "cannot be typed automatically". remark-toc.mjs
// injects `export const toc` into every compiled file, so without this the
// docs shell's right-hand rail - the whole reason the plugin exists - fails to
// compile with "Module '*.mdx' has no exported member 'toc'".
//
// This is a script file on purpose. A top-level import or export would make it
// a module and the `declare module` below would stop being ambient.

/** One heading listed in a doc page's contents rail, in document order. */
type DocTocEntry = {
  /** h2 and h3 only. h1 is the page title; h4 and below are too fine to list. */
  depth: 2 | 3
  /** Matches the id rehype-slug writes onto the rendered heading. */
  id: string
  /** Heading text with any inline markup flattened away. */
  text: string
}

declare module '*.mdx' {
  export const toc: readonly DocTocEntry[]
}
