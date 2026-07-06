import 'server-only'
import { getDb } from '@/lib/db'
import { getSubTypeLabels } from '@revelio/db'

// sub_type_translations is a tiny table and the card page renders dynamically,
// so read it per request — no cache layer to keep consistent, and editor saves
// show up immediately.
export function getSubTypeLabelMap(locale: string): Promise<Record<string, string>> {
  return getSubTypeLabels(getDb(), locale)
}
