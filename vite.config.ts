import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ['src'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/test/**'],
    }),
  ],
  build: {
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      formats: ['es'],
      fileName: 'main',
    },
    rollupOptions: {
      // A function matcher, not a plain string array: it also covers
      // subpaths (react-dom/client, react/jsx-runtime) that a literal
      // ['react-dom'] entry would miss if some future entry point or
      // transitive dep reaches React through one.
      //
      // react-dom being external at all is the load-bearing part. A
      // vite.config.js had silently shadowed this file since the original
      // "replaced build with vite" commit - vite resolves .js before .ts,
      // so every edit made here was dead until that duplicate was removed.
      // The .js version only ever externalized 'react', so react-dom (its
      // own, React-18 copy, since react-dom is a regular dependency here)
      // was bundled into every published dist/main-*.js. That inlined
      // reconciler reads renderer internals off the HOST app's
      // (externalized) React via
      // __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED - the React 18
      // name. React 19 renamed/restructured that object, so on a React 19
      // host the lookup is undefined and the bundled reconciler throws on
      // `ReactCurrentDispatcher`, mount fails with a blank screen. It
      // shipped starting in 26.7.1 because that's when
      // LanguageSelectorModal.tsx's createPortal() call first gave the
      // (always-bundled, previously-dead) react-dom code a live path that
      // actually executes.
      external: (id) => /^react(-dom)?($|\/)/.test(id),
    },
  },
  // Needed for local dev/tests run straight from this repo (some deps
  // reference Node's `global`); unrelated to the library's own published
  // output.
  define: {
    global: 'window',
  },
});
