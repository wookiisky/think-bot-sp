import js from '@eslint/js';
import tsPluginImport from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

const baseConfigs = [js.configs.recommended];
const tsPlugin = tsPluginImport['module.exports'] ?? tsPluginImport;
const tsFlatRecommended = tsPlugin?.flatConfigs?.['flat/recommended'] ?? [];
const tsFlatRecommendedConfigs = Array.isArray(tsFlatRecommended) ? tsFlatRecommended : tsFlatRecommended ? [tsFlatRecommended] : [];

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
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true }
      },
      globals: {
        ...globals.browser,
        ...globals.node
        ,
        chrome: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off'
    }
  }
];
