import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: ['.next*/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', '.pglite*/**', '.storage*/**', 'coverage/**'] },
  ...compat.extends('next/core-web-vitals').map((c) => ({ ...c, files: ['**/*.{js,jsx,mjs,cjs}'] })),
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    rules: {
      'react/no-unescaped-entities': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
];

export default config;
