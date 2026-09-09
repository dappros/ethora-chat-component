import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

const normalizeGlobals = (inputGlobals) =>
  Object.fromEntries(
    Object.entries(inputGlobals).map(([key, value]) => [key.trim(), value])
  );

const browserGlobals = normalizeGlobals({
  ...globals.browser,
  ...globals.es2021,
});

const nodeGlobals = normalizeGlobals({
  ...globals.node,
  ...globals.es2021,
});

export default [
  {
    // Generated, vendored or third-party trees. Linting these produced
    // dozens of meaningless errors (for example test-app-next/.next bundles),
    // which hid the real problems in src/.
    ignores: [
      // build output of this package
      '**/dist/**',
      '**/lib/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      // sample / companion apps checked out next to the library
      'test-app-next/**',
      '**/.next/**',
      'flutter/**',
      'xmpp-client-video/**',
      'video-xmpp/**',
      // tooling scratch dirs
      '.playwright-mcp/**',
      '.claude/worktrees/**',
      // generated artifacts
      '**/*.d.ts',
      '**/*.tsbuildinfo',
      '.eslintrc.cjs',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...browserGlobals,
        ...nodeGlobals,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-undef': 'off',
    },
  },
  {
    files: ['**/*.{cjs}'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        __dirname: 'readonly',
        __filename: 'readonly',
        exports: 'writable',
        module: 'readonly',
        require: 'readonly',
      },
    },
  },
  eslintConfigPrettier,
];
