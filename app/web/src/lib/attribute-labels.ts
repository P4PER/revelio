import en from '@/i18n/attribute-labels/en.json'
import de from '@/i18n/attribute-labels/de.json'
import { slugify } from '@revelio/core'

// The label files are keyed by the original strings ("Charms"); slugify to match our codes.
type LabelFile = Record<string, unknown>
const FILES: Record<string, LabelFile> = { en: en as LabelFile, de: de as LabelFile }

export function attrLabel(
  scope: 'types' | 'lessons' | 'rarities' | 'finishes',
  code: string,
  locale: string,
): string {
  const dict = (FILES[locale]?.[scope] ?? FILES.en?.[scope]) as Record<string, string> | undefined
  if (dict) {
    for (const [rawKey, label] of Object.entries(dict)) {
      if (slugify(rawKey) === code) return label
    }
  }
  return code
}
