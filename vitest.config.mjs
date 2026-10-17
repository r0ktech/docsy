import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/setup/empty.js', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    globalSetup: ['tests/setup/global-setup.mjs'],
    setupFiles: ['tests/setup/env.mjs'],
    // Integration tests share one database.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
