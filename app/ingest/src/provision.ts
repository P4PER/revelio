import { spawn } from 'node:child_process'
import { access, readdir } from 'node:fs/promises'
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

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
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

async function dataPresent(dataDir: string): Promise<boolean> {
  return (
    (await exists(join(dataDir, 'cards.json'))) && (await exists(join(dataDir, 'sets.json')))
  )
}

async function assetsComplete(dirs: Dirs): Promise<boolean> {
  if (!(await hasFiles(join(dirs.assetsDir, 'symbols')))) return false
  const { cards } = await loadDist(dirs.dataDir)
  for (const c of cards) {
    if (!(await exists(join(dirs.assetsDir, 'cards', `${c.id}.webp`)))) return false
  }
  return true
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
  const fetchAssets = buildData || config.force || !(await assetsComplete(dirs))
  if (fetchAssets) {
    console.log('provision: fetching images with accio_images.py')
    await run('accio_images.py', ['--download'])
  } else if (!buildData) {
    console.log('provision: inputs present, nothing to do')
  }
}
