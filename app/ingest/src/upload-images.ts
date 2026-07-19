import { readdir, readFile } from 'node:fs/promises'
import { resolve, join, extname, basename } from 'node:path'
import {
  S3Client, HeadBucketCommand, CreateBucketCommand, PutBucketPolicyCommand,
  HeadObjectCommand, PutObjectCommand,
} from '@aws-sdk/client-s3'
import { fileVersion } from './image-versions.js'

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
    region: c.region ?? 'eu-central-1',
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
  } catch (err) {
    // A missing directory is fine (e.g. the optional thumb/ subdir). Any other
    // error (wrong ASSETS_DIR, permissions) is a real misconfiguration — let it
    // surface rather than reporting a silent {uploaded:0} "success".
    if ((err as { code?: string })?.code === 'ENOENT') return []
    throw err
  }
}

// Assets are produced as WebP by the image pipeline; .png/.jpg are accepted as a
// fallback (e.g. if the download ran without Pillow and saved source files as-is).
const CONTENT_TYPE: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
}

// Split a filename into its id (without extension) and MIME type, or null if the
// extension isn't a supported image type (e.g. the nested `thumb/` directory entry).
function classify(file: string): { id: string; contentType: string } | null {
  const ext = extname(file).toLowerCase()
  const contentType = CONTENT_TYPE[ext]
  if (!contentType) return null
  return { id: basename(file, ext), contentType }
}

async function collectUploads(assetsDir: string): Promise<Upload[]> {
  const uploads: Upload[] = []
  const cardsDir = resolve(assetsDir, 'cards')
  for (const f of await readdirSafe(cardsDir)) {
    const c = classify(f)
    if (!c) continue
    const full = join(cardsDir, f)
    const v = fileVersion(full)
    if (v == null) continue
    uploads.push({ file: full, key: `cards/${c.id}.${v}.webp`, contentType: c.contentType })
  }
  const thumbDir = resolve(cardsDir, 'thumb')
  for (const f of await readdirSafe(thumbDir)) {
    const c = classify(f)
    if (!c) continue
    // Thumb shares the full image's version so both URLs bust together.
    const v = fileVersion(join(cardsDir, f))
    if (v == null) continue
    uploads.push({ file: join(thumbDir, f), key: `cards/thumb/${c.id}.${v}.webp`, contentType: c.contentType })
  }
  const artCropDir = resolve(cardsDir, 'art-crop')
  for (const f of await readdirSafe(artCropDir)) {
    const c = classify(f)
    if (!c) continue
    const full = join(artCropDir, f)
    const v = fileVersion(full)
    if (v == null) continue
    uploads.push({ file: full, key: `cards/art-crop/${c.id}.${v}.webp`, contentType: c.contentType })
  }
  const symbolsDir = resolve(assetsDir, 'symbols')
  for (const f of await readdirSafe(symbolsDir)) {
    const c = classify(f)
    if (!c) continue
    const full = join(symbolsDir, f)
    const v = fileVersion(full)
    if (v == null) continue
    uploads.push({ file: full, key: `symbols/${c.id}.${v}.webp`, contentType: c.contentType })
  }
  return uploads
}

// Diffing is by key existence: card images are immutable by id, so an existing
// object is never re-uploaded. (A content/ETag compare would be needed if assets
// for a given id could change in place.)
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
    await s3.send(new PutObjectCommand({
      Bucket: bucket, Key: u.key, Body: body, ContentType: u.contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }))
    uploaded++
  })
  return { uploaded, skipped }
}
