import { describe, expect, it } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import remarkRehype from 'remark-rehype'
import rehypeSlug from 'rehype-slug'
import { visit } from 'unist-util-visit'
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

// The ids rehype-slug actually writes onto the rendered headings. The toc is
// only useful if its ids are a subset of these, matched heading for heading.
function renderedIds(markdown: string): string[] {
  const md = unified().use(remarkParse)
  const hast = unified().use(remarkRehype).use(rehypeSlug).runSync(md.parse(markdown))
  const ids: string[] = []
  visit(hast, 'element', (node: { tagName?: string; properties?: { id?: string } }) => {
    if (/^h[1-6]$/.test(node.tagName ?? '') && node.properties?.id) ids.push(node.properties.id)
  })
  return ids
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

  // rehype-slug runs one slugger across h1-h6, so a heading this plugin does
  // not list still consumes a suffix. Skip it and every id after the collision
  // is off by one: the rail links to the h4 and the second h2 becomes
  // unreachable. Ids must be taken from every heading, listed or not.
  it('stays in step with rehype-slug across headings it does not list', () => {
    const markdown = '## Options\n\n#### Options\n\n## Options\n'
    expect(tocOf(markdown)).toEqual([
      { depth: 2, id: 'options', text: 'Options' },
      { depth: 2, id: 'options-2', text: 'Options' },
    ])
    expect(renderedIds(markdown)).toEqual(['options', 'options-1', 'options-2'])
  })

  it('exports an empty list for a file with no headings', () => {
    expect(tocOf('Just a paragraph.\n')).toEqual([])
  })
})
