import GithubSlugger from 'github-slugger'
import { visit } from 'unist-util-visit'

// Depths the docs shell lists in its right-hand rail. h1 is the page title,
// which comes from the message catalog rather than the content file, and h4
// and below are too fine to navigate by.
const LISTED_DEPTHS = new Set([2, 3])

// Heading text can hold inline markup (code spans, emphasis, links). The rail
// renders plain text, so flatten to the concatenated string values.
function plainText(node) {
  let out = ''
  visit(node, (child) => {
    if (child.type === 'text' || child.type === 'inlineCode') out += child.value
  })
  return out
}

// A minimal literal-to-estree conversion. The toc is plain JSON (arrays of
// objects of strings and numbers), so the general case is not needed.
function valueToEstree(value) {
  if (Array.isArray(value)) {
    return { type: 'ArrayExpression', elements: value.map(valueToEstree) }
  }
  if (value && typeof value === 'object') {
    return {
      type: 'ObjectExpression',
      properties: Object.entries(value).map(([key, val]) => ({
        type: 'Property',
        kind: 'init',
        method: false,
        shorthand: false,
        computed: false,
        key: { type: 'Identifier', name: key },
        value: valueToEstree(val),
      })),
    }
  }
  return { type: 'Literal', value }
}

/**
 * Injects `export const toc` into every compiled MDX module, so a page's
 * headings are available without parsing the file a second time at runtime.
 *
 * Ids are produced by the same github-slugger that rehype-slug uses, with one
 * slugger per file so the counter that disambiguates repeated headings runs in
 * step with it. Diverge here and every duplicate heading gets a dead anchor.
 */
export default function remarkToc() {
  return (tree) => {
    const slugger = new GithubSlugger()
    const toc = []

    visit(tree, 'heading', (node) => {
      // Slug every heading, not only the listed ones. rehype-slug runs a
      // single slugger over h1-h6, so skipping one here would leave this
      // counter behind: with `#### Options` between two `## Options`, the h4
      // takes `options-1` on the page while the rail hands that id to the
      // second h2 - which then has no anchor pointing at it at all.
      const text = plainText(node)
      const id = slugger.slug(text)
      if (LISTED_DEPTHS.has(node.depth)) toc.push({ depth: node.depth, id, text })
    })

    tree.children.unshift({
      type: 'mdxjsEsm',
      value: `export const toc = ${JSON.stringify(toc)};`,
      data: {
        estree: {
          type: 'Program',
          sourceType: 'module',
          body: [
            {
              type: 'ExportNamedDeclaration',
              specifiers: [],
              source: null,
              declaration: {
                type: 'VariableDeclaration',
                kind: 'const',
                declarations: [
                  {
                    type: 'VariableDeclarator',
                    id: { type: 'Identifier', name: 'toc' },
                    init: valueToEstree(toc),
                  },
                ],
              },
            },
          ],
        },
      },
    })
  }
}
