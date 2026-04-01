import js from '@eslint/js';
import rawTsPlugin from '@typescript-eslint/eslint-plugin/use-at-your-own-risk/raw-plugin';
import tsParser from '@typescript-eslint/parser';

const baseConfigs = [js.configs.recommended];
const tsFlatRecommended = rawTsPlugin.flatConfigs?.['flat/recommended'] ?? [];
const tsFlatRecommendedConfigs = Array.isArray(tsFlatRecommended) ? tsFlatRecommended : [tsFlatRecommended];

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
  ...baseConfigs,
  ...tsFlatRecommendedConfigs,
  {
    files: [
      '*.js',
      '*.ts',
      '*.tsx',
      'src/**/*.{js,ts,tsx}',
      'tests/**/*.{js,ts,tsx}',
      'entrypoints/**/*.{js,ts,tsx}'
    ],
    ignores: ['.output/.wxt/playwright-report/test-results'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true }
      },
      globals: {
        browser: 'readonly',
        process: 'readonly',
        document: 'readonly'
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  }
];
