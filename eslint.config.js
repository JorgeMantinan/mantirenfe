// @ts-check
const js = require('@eslint/js');
const globals = require('globals');
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');
const pluginSecurity = require('eslint-plugin-security');

module.exports = tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/build/**',
      '**/web-build/**',
      '**/.expo/**',
      '**/*.config.*',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Seguridad (flat config del plugin,15 reglas). TODAS en "warn": son
  // hotspots con muchos falsos positivos que triagea una persona, y `pnpm
  // lint` debe seguir saliendo en exit 0 mientras se revisan.
  pluginSecurity.configs.recommended,
  {
    rules: Object.fromEntries(
      Object.keys(pluginSecurity.rules).map((regla) => [`security/${regla}`, 'warn']),
    ),
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx,mts,cts}'],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Patrón legítimo: `let x!: T` leído dentro de un closure y asignado
      // después (p.ej. caché de promesas). Sin esto, prefer-const lo acusa.
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals['react-native'] } },
    rules: {
      // Expo/RN: `require()` es el patrón idiomático (assets, dependencias
      // condicionales como el datepicker o SecureStore).
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['apps/{api,worker}/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['packages/**/*.{ts,tsx,js}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['apps/{web,mobile}/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
