import { readdir, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import {
  S3Client, HeadBucketCommand, CreateBucketCommand, PutBucketPolicyCommand,
  HeadObjectCommand, PutObjectCommand,
} from '@aws-sdk/client-s3'
import { imageKey, thumbKey, symbolKey } from '@revelio/core'

export type S3Config = {
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  region?: string
  forcePathStyle?: boolean
}

export function createS3Client(c: S3Config): S3Client {
  return new S3Client({
    endpoint: c.endpoint,
    region: c.region ?? 'us-east-1',
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    forcePathStyle: c.forcePathStyle ?? true,
  })
}

// A missing bucket/object surfaces as a 404 (or NotFound/NoSuchKey); any other
// error (network, auth, 5xx) is real and must propagate, not be treated as absent.
function isNotFound(err: unknown): boolean {
  const e = err as { $metadata?: { httpStatusCode?: number }; name?: string }
  return e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound' || e?.name === 'NoSuchKey'
}

export async function ensureBucket(s3: S3Client, bucket: string): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }))
  } catch (err) {
    if (!isNotFound(err)) throw err
    await s3.send(new CreateBucketCommand({ Bucket: bucket }))
  }
  const policy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Principal: '*',
      Action: ['s3:GetObject'],
      Resource: [`arn:aws:s3:::${bucket}/*`],
    }],
  })
  await s3.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: policy }))
}

type Upload = { file: string; key: string; contentType: string }

async function readdirSafe(dir: string): Promise<string[]> {
  try {
    return await readdir(dir)
  } catch {
    return []
  }
}

async function collectUploads(assetsDir: string): Promise<Upload[]> {
  const uploads: Upload[] = []
  const cardsDir = resolve(assetsDir, 'cards')
  for (const f of await readdirSafe(cardsDir)) {
    if (f.endsWith('.png')) {
      uploads.push({ file: join(cardsDir, f), key: imageKey(f.slice(0, -4)), contentType: 'image/png' })
    }
  }
  const thumbDir = resolve(cardsDir, 'thumb')
  for (const f of await readdirSafe(thumbDir)) {
    if (f.endsWith('.jpg')) {
      uploads.push({ file: join(thumbDir, f), key: thumbKey(f.slice(0, -4)), contentType: 'image/jpeg' })
    }
  }
  const symbolsDir = resolve(assetsDir, 'symbols')
  for (const f of await readdirSafe(symbolsDir)) {
    if (f.endsWith('.png')) {
      uploads.push({ file: join(symbolsDir, f), key: symbolKey(f.slice(0, -4)), contentType: 'image/png' })
    }
  }
  return uploads
}

async function objectExists(s3: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch (err) {
    if (isNotFound(err)) return false
    throw err
  }
}

// Bounded concurrency (single-threaded JS: counter increments are safe).
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      await fn(items[i++])
    }
  })
  await Promise.all(workers)
}

export async function uploadAssets(
  s3: S3Client, bucket: string, assetsDir: string,
): Promise<{ uploaded: number; skipped: number }> {
  const uploads = await collectUploads(assetsDir)
  let uploaded = 0
  let skipped = 0
  await mapLimit(uploads, 8, async (u) => {
    if (await objectExists(s3, bucket, u.key)) {
      skipped++
      return
    }
    const body = await readFile(u.file)
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: u.key, Body: body, ContentType: u.contentType }))
    uploaded++
  })
  return { uploaded, skipped }
}
