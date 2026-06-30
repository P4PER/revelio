import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { DistSet, DistCard } from './types.js'

export async function loadDist(
  dataDir: string,
): Promise<{ sets: DistSet[]; cards: DistCard[] }> {
  const setsRaw = JSON.parse(
    await readFile(resolve(dataDir, 'sets.json'), 'utf8'),
  ) as Record<string, DistSet>
  const cards = JSON.parse(
    await readFile(resolve(dataDir, 'cards.json'), 'utf8'),
  ) as DistCard[]
  return { sets: Object.values(setsRaw), cards }
}
