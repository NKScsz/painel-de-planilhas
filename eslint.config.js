import globals from 'globals';
import tseslint from 'typescript-eslint';

// Bibliotecas carregadas por <script> no index.html (ou sob demanda) ficam como globais.
const libs = { XLSX: 'readonly', Chart: 'readonly', firebase: 'readonly', pdfjsLib: 'readonly', Tesseract: 'readonly' };

export default [
  { ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', 'backup_*.html'] },
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser, ...libs } },
    rules: { 'no-undef': 'error', 'no-import-assign': 'error', 'no-dupe-keys': 'error', 'no-redeclare': 'error', 'no-unreachable': 'error' },
  },
  ...tseslint.configs.recommended.map(c => ({ ...c, files: ['src/**/*.ts', 'tests/**/*.ts'] })),
  { files: ['src/**/*.ts', 'tests/**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
];
