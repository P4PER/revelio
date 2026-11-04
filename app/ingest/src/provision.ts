import { spawn } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadDist } from './load-dist.js'

type ScriptName = 'build_dataset.py' | 'accio_images.py'

export type ScriptRunner = (script: ScriptName, args: string[]) => Promise<void>

export type ProvisionConfig = {
  enabled: boolean
  force: boolean
  cardDataDir: string
  // Test seam: tests inject a recorder so no Python is needed. Unset means spawn python3.
  run?: ScriptRunner
}

type Dirs = { dataDir: string; assetsDir: string }

const DEFAULT_CARD_DATA_DIR = '/app/card-data'

// A file counts only when it has content: Pillow opens the target before encoding, so a
// run killed mid-save leaves a 0-byte file that the scripts would then skip forever.
async function nonEmpty(path: string): Promise<boolean> {
  try {
    return (await stat(path)).size > 0
  } catch {
    return false
  }
}

async function hasFiles(dir: string): Promise<boolean> {
  try {
    return (await readdir(dir)).length > 0
  } catch {
    return false
  }
}

function spawnRunner(cardDataDir: string, dirs: Dirs): ScriptRunner {
  return (script, args) =>
    new Promise<void>((resolve, reject) => {
      const child = spawn('python3', [join(cardDataDir, script), ...args], {
        cwd: cardDataDir,
        stdio: 'inherit',
        env: { ...process.env, DIST_DIR: dirs.dataDir, ASSETS_DIR: dirs.assetsDir },
      })
      child.on('error', (e) => reject(new Error(`${script} could not start: ${e.message}`)))
      child.on('close', (code, signal) => {
        if (code === 0) resolve()
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

// image_overrides.json maps a card id to its accio filename; a null value declares the
// image unavailable upstream, so the check below does not demand it.
async function knownUnavailable(cardDataDir: string): Promise<Set<string>> {
  try {
    const raw = JSON.parse(await readFile(join(cardDataDir, 'image_overrides.json'), 'utf8'))
    return new Set(Object.keys(raw).filter((k) => raw[k] === null))
  } catch {
    return new Set()
  }
}

async function missingImages(dirs: Dirs, skip: Set<string>): Promise<string[]> {
  const { cards } = await loadDist(dirs.dataDir)
  const missing: string[] = []
  for (const c of cards) {
    if (skip.has(c.id)) continue
    const full = join(dirs.assetsDir, 'cards', `${c.id}.webp`)
    const thumb = join(dirs.assetsDir, 'cards', 'thumb', `${c.id}.webp`)
    if (!(await nonEmpty(full)) || !(await nonEmpty(thumb))) missing.push(c.id)
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
  const run = config.run ?? spawnRunner(config.cardDataDir, dirs)

  const buildData = config.force || !(await dataPresent(dirs.dataDir))
  if (buildData) {
    console.log('provision: building dataset with build_dataset.py')
    // The scratch clone path is removed by the script itself.
    await run('build_dataset.py', [join(tmpdir(), 'hpjson')])
  }

  // A fresh data build leaves image.url unset until accio_images.py rewrites it, so the
  // assets script must follow a data build even when every image is already on disk.
  const skip = await knownUnavailable(config.cardDataDir)
  const fetchAssets =
    buildData ||
    config.force ||
    !(await hasFiles(join(dirs.assetsDir, 'symbols'))) ||
    (await missingImages(dirs, skip)).length > 0
  if (fetchAssets) {
    console.log('provision: fetching images with accio_images.py')
    await run('accio_images.py', ['--download'])
    // The script exits 0 when single downloads fail, and ingest inserts image versions
    // once (onConflictDoNothing), so a card loaded without its file never gets one.
    const missing = await missingImages(dirs, skip)
    if (missing.length > 0) {
      const shown = missing.slice(0, 20).join(', ')
      throw new Error(
        `accio_images.py finished but ${missing.length} card image(s) are missing: ${shown}` +
          ' (rerun to retry, or mark an unavailable one null in image_overrides.json)',
      )
    }
  } else {
    console.log('provision: inputs present, nothing to do')
  }
}
