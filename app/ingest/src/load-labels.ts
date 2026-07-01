import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { slugify } from '@revelio/core'

// scope -> slug code -> { lang -> label }
export type LabelIndex = Record<string, Record<string, Record<string, string>>>

const CATEGORY_TO_SCOPE: Record<string, string> = {
  types: 'types', lessons: 'lessons', rarities: 'rarities', finishes: 'finishes',
}

export async function loadLabels(i18nDir: string): Promise<LabelIndex> {
  const index: LabelIndex = {}
  let files: string[]
  try {
    files = (await readdir(i18nDir)).filter((f) => /^labels\..+\.json$/.test(f))
  } catch {
    return index // no i18n dir -> no labels
  }
  for (const file of files) {
    const data = JSON.parse(await readFile(resolve(i18nDir, file), 'utf8')) as Record<string, unknown>
    const lang = typeof data.language === 'string' ? data.language : file.replace(/^labels\.|\.json$/g, '')
    for (const [category, scope] of Object.entries(CATEGORY_TO_SCOPE)) {
      const dict = data[category] as Record<string, string> | undefined
      if (!dict) continue
      const scopeMap = (index[scope] ??= {})
      for (const [rawKey, label] of Object.entries(dict)) {
        const code = slugify(rawKey)
        ;(scopeMap[code] ??= {})[lang] = label
      }
    }
  }
  return index
}
