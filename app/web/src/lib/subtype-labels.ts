import 'server-only'
import { unstable_cache } from 'next/cache'
import { getDb } from '@/lib/db'
import { getSubTypeLabels } from '@revelio/db'

// Sub-type translations change rarely; cache per locale under a shared tag the
// save action revalidates. Returns code -> label for the given locale.
export function getSubTypeLabelMap(locale: string): Promise<Record<string, string>> {
  return unstable_cache(
    () => getSubTypeLabels(getDb(), locale),
    ['sub-type-labels', locale],
    { tags: ['sub-type-labels'] },
  )()
}
