import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  provision,
  readProvisionConfig,
  type ProvisionConfig,
} from '../src/provision.js'

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/dataset')

type Call = [string, string[]]

let root: string
let dataDir: string
let assetsDir: string
let calls: Call[]

function config(over: Partial<ProvisionConfig> = {}): ProvisionConfig {
  return {
    enabled: true,
    force: false,
    cardDataDir: '/unused',
    run: async (script, args) => {
      calls.push([script, args])
    },
    ...over,
  }
}

async function putData(): Promise<void> {
  await mkdir(dataDir, { recursive: true })
  await copyFile(join(fixtureDir, 'cards.json'), join(dataDir, 'cards.json'))
  await copyFile(join(fixtureDir, 'sets.json'), join(dataDir, 'sets.json'))
}

async function allCardIds(): Promise<string[]> {
  const { loadDist } = await import('../src/load-dist.js')
  return (await loadDist(fixtureDir)).cards.map((c) => c.id)
}

async function putImages(ids: string[]): Promise<void> {
  await mkdir(join(assetsDir, 'cards'), { recursive: true })
  await mkdir(join(assetsDir, 'symbols'), { recursive: true })
  for (const id of ids) await writeFile(join(assetsDir, 'cards', `${id}.webp`), 'x')
  await writeFile(join(assetsDir, 'symbols', 'BS.webp'), 'x')
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'provision-'))
  dataDir = join(root, 'data')
  assetsDir = join(root, 'assets')
  calls = []
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('provision', () => {
  it('spawns nothing when disabled', async () => {
    await provision({ dataDir, assetsDir }, config({ enabled: false }))
    expect(calls).toEqual([])
  })

  it('spawns nothing when data and assets are complete', async () => {
    await putData()
    await putImages(await allCardIds())
    await provision({ dataDir, assetsDir }, config())
    expect(calls).toEqual([])
  })

  it('builds data then assets when both are empty', async () => {
    await provision({ dataDir, assetsDir }, config())
    expect(calls.map((c) => c[0])).toEqual(['build_dataset.py', 'accio_images.py'])
    expect(calls[1]![1]).toEqual(['--download'])
  })

  it('runs the assets script after a data build even if images exist', async () => {
    await putImages(await allCardIds())
    await provision({ dataDir, assetsDir }, config())
    expect(calls.map((c) => c[0])).toEqual(['build_dataset.py', 'accio_images.py'])
  })

  it('completes an interrupted image run', async () => {
    await putData()
    const ids = await allCardIds()
    await putImages(ids.slice(1))
    await provision({ dataDir, assetsDir }, config())
    expect(calls.map((c) => c[0])).toEqual(['accio_images.py'])
  })

  it('force reruns both scripts on populated dirs', async () => {
    await putData()
    await putImages(await allCardIds())
    await provision({ dataDir, assetsDir }, config({ force: true }))
    expect(calls.map((c) => c[0])).toEqual(['build_dataset.py', 'accio_images.py'])
  })

  it('rejects with the script name when a script fails', async () => {
    const run = async (script: string, args: string[]) => {
      calls.push([script, args])
      if (script === 'build_dataset.py') throw new Error('build_dataset.py exited with code 1')
    }
    let caught: unknown
    try {
      await provision({ dataDir, assetsDir }, config({ run }))
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain('build_dataset.py')
    expect(calls.map((c) => c[0])).toEqual(['build_dataset.py'])
  })
})

describe('readProvisionConfig', () => {
  it('defaults and parsing', () => {
    const base = { enabled: true, force: false, cardDataDir: '/app/card-data' }
    expect(readProvisionConfig({})).toEqual(base)
    expect(readProvisionConfig({ PROVISION: 'false' })).toEqual({ ...base, enabled: false })
    expect(readProvisionConfig({ FORCE_PROVISION: 'true' })).toEqual({ ...base, force: true })
    expect(readProvisionConfig({ PROVISION: 'no', FORCE_PROVISION: '1' })).toEqual(base)
    expect(readProvisionConfig({ CARD_DATA_DIR: '/x' }).cardDataDir).toBe('/x')
  })
})

const hasPython = spawnSync('python3', ['--version']).status === 0

describe('default runner', () => {
  it.skipIf(!hasPython)('rejects on non-zero exit naming script and code', async () => {
    const cardDataDir = join(root, 'cd')
    await mkdir(cardDataDir, { recursive: true })
    await writeFile(join(cardDataDir, 'build_dataset.py'), 'import sys\nsys.exit(3)\n')
    const cfg: ProvisionConfig = { enabled: true, force: false, cardDataDir }
    let caught: unknown
    try {
      await provision({ dataDir, assetsDir }, cfg)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain('build_dataset.py')
    expect((caught as Error).message).toContain('3')
  })
})
