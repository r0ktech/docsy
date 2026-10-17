import 'server-only';
import { getConfig } from '@/server/config';
import { Errors } from '@/server/errors';
import { createLocalStorage } from '@/server/storage/local';
import { createS3Storage } from '@/server/storage/s3';

/**
 * Private object storage. Two drivers share one interface:
 *
 *   putObject(key, bytes, contentType)
 *   getObject(key) -> Buffer
 *   getObjectStream(key) -> { stream: ReadableStream, size }
 *   headObject(key) -> { size } | null
 *   deleteObject(key)
 *   createUploadTarget({ key, documentId, contentType, size }) -> { url, method, headers }
 *
 * Objects are never publicly readable. Browsers upload either straight to S3
 * with a short-lived presigned PUT, or (local driver) through an authenticated
 * route. Downloads always go through an authenticated route that checks
 * ownership first.
 */
let instance;

export function getStorage() {
  if (instance) return instance;
  const config = getConfig();
  if (config.STORAGE_DRIVER === 's3') {
    if (!config.S3_BUCKET || !config.S3_REGION || !config.S3_ACCESS_KEY_ID || !config.S3_SECRET_ACCESS_KEY) {
      throw Errors.unavailable('STORAGE_NOT_CONFIGURED', 'File storage is not configured on this deployment.');
    }
    instance = createS3Storage(config);
  } else {
    instance = createLocalStorage(config);
  }
  return instance;
}

/** Storage keys never contain user-supplied text. */
export function documentStorageKey(userId, documentId) {
  return `users/${userId}/documents/${documentId}`;
}
