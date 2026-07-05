import 'server-only'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

export function getS3(): S3Client {
  const endpoint = process.env.S3_ENDPOINT
  if (!endpoint) throw new Error('S3_ENDPOINT is required')
  return new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? '',
      secretAccessKey: process.env.S3_SECRET_KEY ?? '',
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  })
}

const bucket = () => process.env.S3_BUCKET ?? 'card-images'

export async function putObject(s3: S3Client, key: string, body: Buffer, contentType: string) {
  await s3.send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }))
}

export async function deleteObject(s3: S3Client, key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
}
