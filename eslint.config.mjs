import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const ignoreConfig = {
  ignores: [
    '.wxt/**',
    '.output/**',
    'playwright-report/**',
    'test-results/**'
  ]
};

export default [
  ignoreConfig,
  js.configs.recommended,
  ...(Array.isArray(tseslint.configs.recommended) ? tseslint.configs.recommended : [tseslint.configs.recommended]),
  {
    files: [
      '*.js',
      '*.ts',
      '*.tsx',
      'src/**/*.{js,ts,tsx}',
      'tests/**/*.{js,ts,tsx}',
      'entrypoints/**/*.{js,ts,tsx}'
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true }
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  }
];
