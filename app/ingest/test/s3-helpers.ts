import { randomUUID } from 'node:crypto'
import {
  S3Client, ListObjectsV2Command, DeleteObjectCommand, DeleteBucketCommand,
} from '@aws-sdk/client-s3'

export function testS3Config(bucket: string) {
  return {
    endpoint: process.env.TEST_S3_ENDPOINT ?? 'http://localhost:9000',
    bucket,
    accessKeyId: process.env.TEST_S3_ACCESS_KEY ?? 'minioadmin',
    secretAccessKey: process.env.TEST_S3_SECRET_KEY ?? 'minioadmin',
    region: 'us-east-1',
    forcePathStyle: true,
  }
}

export function uniqueBucket(): string {
  return `test-${randomUUID().replace(/-/g, '')}`
}

export async function nukeBucket(s3: S3Client, bucket: string): Promise<void> {
  const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket }))
  for (const o of listed.Contents ?? []) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: o.Key }))
  }
  await s3.send(new DeleteBucketCommand({ Bucket: bucket }))
}
