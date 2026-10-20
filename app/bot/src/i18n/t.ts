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

// Parsing is the expensive half of formatting, and the same few keys are hit on
// every interaction, so each locale/key pair is parsed once.
function parsed(locale: string, key: string, template: string): IntlMessageFormat {
  const cacheKey = `${locale}:${key}`
  let format = FORMATS.get(cacheKey)
  if (!format) {
    format = new IntlMessageFormat(template, locale)
    FORMATS.set(cacheKey, format)
  }
  return format
}

// Swaps every argument with no value for the literal {name}, plural and select
// included, and walks into their branches for arguments nested there.
function showMissing(ast: Element[], vars: Vars): Element[] {
  return ast.map((el) => {
    if (el.type === LITERAL || !('value' in el) || typeof el.value !== 'string') return el
    if (!(el.value in vars)) return { type: LITERAL, value: `{${el.value}}` } as Element
    if (!('options' in el)) return el
    const options = Object.fromEntries(Object.entries(el.options).map(
      ([branch, option]) => [branch, { ...option, value: showMissing(option.value, vars) }],
    ))
    return { ...el, options } as Element
  })
}

// Flat keys, ICU message syntax - the same as web's next-intl catalogs, so a
// count is written {count, plural, one {# card} other {# cards}}. An unsupplied
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
  const final = filled.every((el, i) => el === ast[i]) ? format : new IntlMessageFormat(filled, lang)
  return String(final.format(vars))
}
