import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    proxy: {
      // The translation service doesn't send Access-Control-Allow-Origin
      // yet, so browsers block direct cross-origin calls to it. In dev the
      // demo app points config.translates.endpoint at this same-origin
      // path instead (see App.tsx); production hosts need the service (an
      // Express app) to enable CORS, or to proxy it the same way.
      '/translate-api': {
        target: 'https://translate.api.chat-qa.ethora.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/translate-api/, ''),
      },
    },
  },
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
      external: ['react', 'react/jsx-runtime'],
    },
  },
});
