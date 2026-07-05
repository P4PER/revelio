// Fails if app/db/src/schema.ts has changes not captured in a migration.
// Runs `drizzle-kit generate`; if it writes/changes anything under drizzle/,
// the schema drifted from the migrations — restore the tree (so this is safe to
// run in CI and locally) and exit non-zero. No database is needed (generate
// diffs schema vs. the stored snapshot).
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const dbDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const run = (cmd) => execSync(cmd, { cwd: dbDir, stdio: 'pipe' }).toString()

execSync('npx drizzle-kit generate', { cwd: dbDir, stdio: 'inherit' })

const dirty = run('git status --porcelain -- drizzle').trim()
if (dirty) {
  // Restore drizzle/ to HEAD: revert modified tracked files, delete new ones.
  run('git checkout -- drizzle')
  run('git clean -f -- drizzle')
  console.error('\n✗ schema.ts has changes not captured in a migration.')
  console.error('  Run `npm run generate` in app/db, review the new migration, and commit it.\n')
  process.exit(1)
}
console.log('✓ migrations are in sync with schema.ts')
