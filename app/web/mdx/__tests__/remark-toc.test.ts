import { describe, expect, it } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import remarkToc from '../remark-toc.mjs'

// The plugin injects an ESM export node into the tree. Reading it back out of
// the AST is the cheapest way to assert what a compiled module would export.
const processor = unified().use(remarkParse).use(remarkMdx).use(remarkToc)

function tocOf(markdown: string): unknown {
  const tree = processor.runSync(processor.parse(markdown)) as {
    children: { type: string; value?: string }[]
  }
  const node = tree.children.find((child) => child.type === 'mdxjsEsm')
  if (!node?.value) return undefined
  return JSON.parse(node.value.replace('export const toc = ', '').replace(/;$/, ''))
}

describe('remarkToc', () => {
  it('collects h2 and h3 headings in document order', () => {
    expect(tocOf('## Alpha\n\ntext\n\n### Beta\n\n## Gamma\n')).toEqual([
      { depth: 2, id: 'alpha', text: 'Alpha' },
      { depth: 3, id: 'beta', text: 'Beta' },
      { depth: 2, id: 'gamma', text: 'Gamma' },
    ])
  })

  it('ignores h1 and h4, which the shell does not list', () => {
    expect(tocOf('# Title\n\n## Kept\n\n#### Dropped\n')).toEqual([
      { depth: 2, id: 'kept', text: 'Kept' },
    ])
  })

  // rehype-slug slugs the rendered headings independently, so the ids this
  // plugin produces must match its algorithm or every anchor is dead.
  it('deduplicates repeated headings the way rehype-slug does', () => {
    expect(tocOf('## Limits\n\n## Limits\n')).toEqual([
      { depth: 2, id: 'limits', text: 'Limits' },
      { depth: 2, id: 'limits-1', text: 'Limits' },
    ])
  })

  it('flattens inline markup in a heading to plain text', () => {
    expect(tocOf('## The `/search` command\n')).toEqual([
      { depth: 2, id: 'the-search-command', text: 'The /search command' },
    ])
  })

  it('exports an empty list for a file with no headings', () => {
    expect(tocOf('Just a paragraph.\n')).toEqual([])
  })
})
