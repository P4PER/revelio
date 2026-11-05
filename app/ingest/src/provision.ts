import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadDist } from './load-dist.js'

type ScriptName = 'build_dataset.py' | 'accio_images.py'

export type ScriptRunner = (script: ScriptName, args: string[]) => Promise<void>

export type ProvisionConfig = {
  enabled: boolean
  force: boolean
  cardDataDir: string
  // Longest a single script may run before it is killed. Defaults to DEFAULT_TIMEOUT_MS.
  timeoutMs?: number
  // Test seam: tests inject a recorder so no Python is needed. Unset means spawn python3.
  run?: ScriptRunner
}

type Dirs = { dataDir: string; assetsDir: string }

const DEFAULT_CARD_DATA_DIR = '/app/card-data'
// The first run downloads ~471 MB, so this is generous; it only exists so a stalled
// git clone or connection cannot hold the job (and its Postgres connection) forever.
const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000

// A file counts only when it has content: Pillow opens the target before encoding, so a
// run killed mid-save leaves a 0-byte file that the scripts would then skip forever.
async function nonEmpty(path: string): Promise<boolean> {
  try {
    return (await stat(path)).size > 0
  } catch {
    return false
  }
}

function spawnRunner(config: ProvisionConfig, dirs: Dirs): ScriptRunner {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return (script, args) =>
    new Promise<void>((resolve, reject) => {
      const child = spawn('python3', [join(config.cardDataDir, script), ...args], {
        cwd: config.cardDataDir,
        stdio: 'inherit',
        env: { ...process.env, DIST_DIR: dirs.dataDir, ASSETS_DIR: dirs.assetsDir },
      })
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, timeoutMs)
      child.on('error', (e) => {
        clearTimeout(timer)
        reject(new Error(`${script} could not start: ${e.message}`))
      })
      child.on('close', (code, signal) => {
        clearTimeout(timer)
        if (timedOut) reject(new Error(`${script} timed out after ${Math.round(timeoutMs / 1000)}s`))
        else if (code === 0) resolve()
        else reject(new Error(`${script} exited with ${code === null ? `signal ${signal}` : `code ${code}`}`))
      })
    })
}

// Present means both files parse: the scripts write them non-atomically, so a killed run
// can leave a truncated one, which must be rebuilt rather than fail every later run.
async function dataPresent(dataDir: string): Promise<boolean> {
  try {
    await loadDist(dataDir)
    return true
  } catch {
    return false
  }
}

// Card ids with an accio filename in image_overrides.json. accio_images.py fetches a card
// only when it has one of these or an en image.file, so a card with neither is not demanded.
async function overriddenIds(cardDataDir: string): Promise<Set<string>> {
  try {
    const raw = JSON.parse(await readFile(join(cardDataDir, 'image_overrides.json'), 'utf8'))
    return new Set(Object.keys(raw).filter((k) => raw[k]))
  } catch {
    return new Set()
  }
}

// What the assets script should have produced, as "card <id>" / "symbol <code>" labels.
// Versions are stamped from these files at insert time and never updated, so a gap here
// would freeze a null version into Postgres.
async function missingAssets(dirs: Dirs, cardDataDir: string): Promise<string[]> {
  const { sets, cards } = await loadDist(dirs.dataDir)
  const overridden = await overriddenIds(cardDataDir)
  const missing: string[] = []
  for (const c of cards) {
    if (!overridden.has(c.id) && !c.localizations.en?.image?.file) continue
    const full = join(dirs.assetsDir, 'cards', `${c.id}.webp`)
    const thumb = join(dirs.assetsDir, 'cards', 'thumb', `${c.id}.webp`)
    if (!(await nonEmpty(full)) || !(await nonEmpty(thumb))) missing.push(`card ${c.id}`)
  }
  for (const set of sets) {
    if (set.symbol && !(await nonEmpty(join(dirs.assetsDir, 'symbols', `${set.code}.webp`)))) {
      missing.push(`symbol ${set.code}`)
    }
  }
  return missing
}

export function readProvisionConfig(env: NodeJS.ProcessEnv): ProvisionConfig {
  return {
    enabled: env.PROVISION !== 'false',
    force: env.FORCE_PROVISION === 'true',
    cardDataDir: env.CARD_DATA_DIR || DEFAULT_CARD_DATA_DIR,
  }
}

export async function provision(dirs: Dirs, config: ProvisionConfig): Promise<void> {
  if (!config.enabled) return
  const run = config.run ?? spawnRunner(config, dirs)

  const buildData = config.force || !(await dataPresent(dirs.dataDir))
  if (buildData) {
    console.log('provision: building dataset with build_dataset.py')
    // A fresh path per run: build_dataset.py reuses whatever it finds at the path, so a
    // fixed one would let a clone left by a killed run feed the next build.
    const scratch = await mkdtemp(join(tmpdir(), 'hpjson-'))
    try {
      await run('build_dataset.py', [scratch])
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }
  }

  // A fresh data build leaves image.url unset until accio_images.py rewrites it, so the
  // assets script must follow a data build even when every image is already on disk.
  const fetchAssets =
    buildData || config.force || (await missingAssets(dirs, config.cardDataDir)).length > 0
  if (fetchAssets) {
    console.log('provision: fetching images with accio_images.py')
    await run('accio_images.py', ['--download'])
    // The script exits 0 when single downloads fail, and ingest inserts image versions
    // once (onConflictDoNothing), so a card or set loaded without its file never gets one.
    const missing = await missingAssets(dirs, config.cardDataDir)
    if (missing.length > 0) {
      throw new Error(
        `accio_images.py finished but ${missing.length} asset(s) are missing: ` +
          `${missing.slice(0, 20).join(', ')} (rerun to retry)`,
      )
    }
  } else {
    console.log('provision: inputs present, nothing to do')
  }
}
