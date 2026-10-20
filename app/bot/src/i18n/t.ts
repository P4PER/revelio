import { IntlMessageFormat } from 'intl-messageformat'
import en from './en.json'
import de from './de.json'
import { DEFAULT_LOCALE } from './locale'

type Catalog = Record<string, string>
type Vars = Record<string, string | number>
// intl-messageformat does not re-export its parser's element types.
type Element = ReturnType<IntlMessageFormat['getAst']>[number]

const CATALOGS: Record<string, Catalog> = { en, de }
const FORMATS = new Map<string, IntlMessageFormat>()
// TYPE.literal in @formatjs/icu-messageformat-parser, not re-exported either.
const LITERAL = 0
// Discord markup (<@id>, <#channel>, <t:ts:R>) is plain text here, not an ICU
// rich-text tag.
const OPTIONS = { ignoreTag: true }

// Parsing is the expensive half of formatting, and the same few keys are hit on
// every interaction, so each locale/key pair is parsed once.
function parsed(locale: string, key: string, template: string): IntlMessageFormat {
  const cacheKey = `${locale}:${key}`
  let format = FORMATS.get(cacheKey)
  if (!format) {
    format = new IntlMessageFormat(template, locale, undefined, OPTIONS)
    FORMATS.set(cacheKey, format)
  }
  return format
}

// An own property that is not undefined; `in` would also accept toString and
// the rest of Object.prototype.
function supplied(vars: Vars, name: string): boolean {
  return Object.hasOwn(vars, name) && vars[name] !== undefined
}

// Swaps every argument with no value for the literal {name}, plural and select
// included, and walks into their branches for arguments nested there. Returns
// the same array when nothing was missing, so t() can keep the cached format.
function showMissing(ast: Element[], vars: Vars): Element[] {
  let changed = false
  const filled = ast.map((el) => {
    const next = fillElement(el, vars)
    if (next !== el) changed = true
    return next
  })
  return changed ? filled : ast
}

function fillElement(el: Element, vars: Vars): Element {
  if (el.type === LITERAL || !('value' in el) || typeof el.value !== 'string') return el
  if (!supplied(vars, el.value)) return { type: LITERAL, value: `{${el.value}}` } as Element
  if (!('options' in el)) return el
  let changed = false
  const options = Object.fromEntries(Object.entries(el.options).map(([branch, option]) => {
    const value = showMissing(option.value, vars)
    if (value !== option.value) changed = true
    return [branch, { ...option, value }]
  }))
  return changed ? ({ ...el, options } as Element) : el
}

// Flat keys, ICU message syntax - the same as web's next-intl catalogs, so a
// count is written {count, plural, one {{count} card} other {{count} cards}}.
// Not `#`: that goes through Intl.NumberFormat and prints 1,234 where every
// plain {count} prints 1234. An unsupplied
// placeholder is left in place rather than rendered as "undefined" (or thrown,
// as intl-messageformat would), so a missing variable is obvious in the
// channel instead of silently reading as real copy.
export function t(locale: string, key: string, vars: Vars = {}): string {
  const resolved = CATALOGS[locale] ? locale : DEFAULT_LOCALE
  const own = CATALOGS[resolved][key]
  const template = own ?? CATALOGS[DEFAULT_LOCALE][key]
  if (template === undefined) return key
  const lang = own === undefined ? DEFAULT_LOCALE : resolved
  const format = parsed(lang, key, template)
  const ast = format.getAst()
  const filled = showMissing(ast, vars)
  const final = filled === ast ? format : new IntlMessageFormat(filled, lang, undefined, OPTIONS)
  return String(final.format(vars))
}
