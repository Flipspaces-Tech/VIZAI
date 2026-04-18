import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'process/browser': 'process/browser.js',
      stream: 'stream-browserify',
      path: 'path-browserify',
      os: 'os-browserify/browser',
      zlib: 'browserify-zlib',
      buffer: 'buffer',
      http: 'stream-http',
      https: 'https-browserify'
    }
  },
  define: {
    'process.env': {},
    global: 'globalThis'
  },
  build: { sourcemap: true }
});
