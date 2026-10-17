import 'server-only';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * S3-compatible driver: AWS S3, Supabase Storage (S3 endpoint), Cloudflare R2,
 * MinIO, etc. The bucket must be private.
 */
export function createS3Storage(config) {
  const client = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT || undefined,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY },
  });
  const Bucket = config.S3_BUCKET;

  return {
    driver: 's3',
    async putObject(key, bytes, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: bytes, ContentType: contentType }));
    },
    async getObject(key) {
      const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      return Buffer.from(await res.Body.transformToByteArray());
    },
    async getObjectStream(key) {
      const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      return { stream: res.Body.transformToWebStream(), size: res.ContentLength };
    },
    async headObject(key) {
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { size: res.ContentLength };
      } catch (err) {
        if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return null;
        throw err;
      }
    },
    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    async createUploadTarget({ key, contentType, size }) {
      // ContentLength is signed, so the client cannot upload more bytes than it declared.
      const command = new PutObjectCommand({ Bucket, Key: key, ContentType: contentType, ContentLength: size });
      const url = await getSignedUrl(client, command, { expiresIn: 600 });
      return { method: 'PUT', url, headers: { 'Content-Type': contentType } };
    },
  };
}
