import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createS3Client, ensureBucket, uploadAssets } from '../src/upload-images.js'
import { testS3Config, uniqueBucket, nukeBucket } from './s3-helpers.js'

const bucket = uniqueBucket()
const cfg = testS3Config(bucket)
const s3 = createS3Client(cfg)
let assetsDir: string

beforeAll(async () => {
  assetsDir = await mkdtemp(join(tmpdir(), 'revelio-assets-'))
  await mkdir(join(assetsDir, 'cards', 'thumb'), { recursive: true })
  await mkdir(join(assetsDir, 'symbols'), { recursive: true })
  await writeFile(join(assetsDir, 'cards', 'bs-1-x.webp'), Buffer.from('WEBPDATA'))
  await writeFile(join(assetsDir, 'cards', 'thumb', 'bs-1-x.webp'), Buffer.from('THUMBDATA'))
  await writeFile(join(assetsDir, 'symbols', 'BS.webp'), Buffer.from('SYMDATA'))
  await ensureBucket(s3, bucket)
}, 60_000)
afterAll(async () => { await nukeBucket(s3, bucket) })

describe('uploadAssets', () => {
  it('uploads full cards, thumbnails and symbols', async () => {
    const res = await uploadAssets(s3, bucket, assetsDir)
    expect(res).toEqual({ uploaded: 3, skipped: 0 })
    await expect(s3.send(new HeadObjectCommand({ Bucket: bucket, Key: 'cards/bs-1-x.webp' }))).resolves.toBeTruthy()
    await expect(s3.send(new HeadObjectCommand({ Bucket: bucket, Key: 'cards/thumb/bs-1-x.webp' }))).resolves.toBeTruthy()
    await expect(s3.send(new HeadObjectCommand({ Bucket: bucket, Key: 'symbols/BS.webp' }))).resolves.toBeTruthy()
  })

  it('serves objects with public (unauthenticated) read', async () => {
    const res = await fetch(`${cfg.endpoint}/${bucket}/cards/bs-1-x.webp`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('WEBPDATA')
  })

  it('skips objects that already exist on re-run (diffed)', async () => {
    const res = await uploadAssets(s3, bucket, assetsDir)
    expect(res).toEqual({ uploaded: 0, skipped: 3 })
  })
})
