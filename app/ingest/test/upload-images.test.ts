import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { imageKey, thumbKey, artCropKey, symbolKey } from '@revelio/core'
import { createS3Client, ensureBucket, uploadAssets } from '../src/upload-images.js'
import { fileVersion } from '../src/image-versions.js'
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
  await mkdir(join(assetsDir, 'cards', 'art-crop'), { recursive: true })
  await writeFile(join(assetsDir, 'cards', 'art-crop', 'bs-1-x.webp'), Buffer.from('CROPDATA'))
  await writeFile(join(assetsDir, 'symbols', 'BS.webp'), Buffer.from('SYMDATA'))
  await ensureBucket(s3, bucket)
}, 60_000)
afterAll(async () => { await nukeBucket(s3, bucket) })

// Keys are versioned by the source file's mtime; thumb reuses the full image's version.
const fullV = () => fileVersion(join(assetsDir, 'cards', 'bs-1-x.webp'))!
const cropV = () => fileVersion(join(assetsDir, 'cards', 'art-crop', 'bs-1-x.webp'))!
const symV = () => fileVersion(join(assetsDir, 'symbols', 'BS.webp'))!

describe('uploadAssets', () => {
  it('uploads full cards, thumbnails and symbols under versioned keys', async () => {
    const res = await uploadAssets(s3, bucket, assetsDir)
    expect(res).toEqual({ uploaded: 4, skipped: 0 })
    await expect(s3.send(new HeadObjectCommand({ Bucket: bucket, Key: artCropKey('bs-1-x', cropV()) }))).resolves.toBeTruthy()
    await expect(s3.send(new HeadObjectCommand({ Bucket: bucket, Key: imageKey('bs-1-x', fullV()) }))).resolves.toBeTruthy()
    await expect(s3.send(new HeadObjectCommand({ Bucket: bucket, Key: thumbKey('bs-1-x', fullV()) }))).resolves.toBeTruthy()
    await expect(s3.send(new HeadObjectCommand({ Bucket: bucket, Key: symbolKey('BS', symV()) }))).resolves.toBeTruthy()
  })

  it('serves objects with public (unauthenticated) read', async () => {
    const res = await fetch(`${cfg.endpoint}/${bucket}/${imageKey('bs-1-x', fullV())}`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('WEBPDATA')
  })

  it('skips objects that already exist on re-run (diffed)', async () => {
    const res = await uploadAssets(s3, bucket, assetsDir)
    expect(res).toEqual({ uploaded: 0, skipped: 4 })
  })
})
