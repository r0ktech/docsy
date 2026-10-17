import 'server-only';
import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

/**
 * Filesystem driver for local development and tests. Not suitable for
 * serverless hosting, where the filesystem is ephemeral — use the S3 driver.
 */
export function createLocalStorage(config) {
  const root = path.resolve(process.cwd(), config.LOCAL_STORAGE_DIR);

  function resolve(key) {
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new Error('Invalid storage key');
    return full;
  }

  return {
    driver: 'local',
    async putObject(key, bytes) {
      const file = resolve(key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, bytes);
    },
    async getObject(key) {
      return fs.readFile(resolve(key));
    },
    async getObjectStream(key) {
      const file = resolve(key);
      const { size } = await fs.stat(file);
      return { stream: Readable.toWeb(createReadStream(file)), size };
    },
    async headObject(key) {
      try {
        const { size } = await fs.stat(resolve(key));
        return { size };
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    },
    async deleteObject(key) {
      await fs.rm(resolve(key), { force: true });
    },
    async createUploadTarget({ documentId }) {
      return { method: 'PUT', url: `/api/uploads/${documentId}/content`, headers: {} };
    },
  };
}
