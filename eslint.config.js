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
      // The base rule does not understand TypeScript (type-only imports,
      // parameter properties), so it stays off in favour of the TS one.
      'no-unused-vars': 'off',
      // Both are "warn", not "error": there is a backlog of pre-existing
      // hits and blocking the build on them would only get the rules
      // switched off again. Warnings keep them visible for new code.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // Stale closures in effects are this codebase's most expensive bug
      // class, see the 75s stall documented in useChatWrapperInit.ts.
      'react-hooks/exhaustive-deps': 'warn',
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
