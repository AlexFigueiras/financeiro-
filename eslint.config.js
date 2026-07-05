const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

const NODE_GLOBALS = {
  require: 'readonly',
  module: 'readonly',
  process: 'readonly',
  __dirname: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
};

const BROWSER_GLOBALS = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  fetch: 'readonly',
  FormData: 'readonly',
  URLSearchParams: 'readonly',
  URL: 'readonly',
  Chart: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  getComputedStyle: 'readonly',
  console: 'readonly',
  Headers: 'readonly',
  localStorage: 'readonly',
  confirm: 'readonly',
};

const SERVICE_WORKER_GLOBALS = {
  self: 'readonly',
  caches: 'readonly',
  fetch: 'readonly',
  URL: 'readonly',
};

module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'public/vendor/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['*.config.js', 'scripts/**/*.js'],
    languageOptions: { globals: NODE_GLOBALS, sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['public/sw.js'],
    languageOptions: { globals: SERVICE_WORKER_GLOBALS },
  },
  {
    files: ['public/*.js'],
    ignores: ['public/sw.js'],
    languageOptions: { globals: BROWSER_GLOBALS },
  }
);
