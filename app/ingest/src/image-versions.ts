import { statSync } from 'node:fs'

// The version stamped into an image's object key and stored in Postgres. Using the
// source file's mtime (in epoch seconds) keeps re-ingest idempotent: unchanged
// files keep the same key, so upload diffing still skips them.
export function fileVersion(path: string): number | null {
  try {
    return Math.floor(statSync(path).mtimeMs / 1000)
  } catch (err) {
    if ((err as { code?: string })?.code === 'ENOENT') return null
    throw err
  }
}
