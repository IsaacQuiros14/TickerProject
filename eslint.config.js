// eslint.config.js — Reglas de estilo y errores comunes (ESLint 9, configuración plana)
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/', 'data/', 'docs/'] },
  js.configs.recommended,
  {
    // Backend (CommonJS)
    files: ['**/*.js'],
    ignores: ['public/**'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: globals.node },
  },
  {
    // Frontend (módulos ES en el navegador)
    files: ['public/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.browser },
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
];
