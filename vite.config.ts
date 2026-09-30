import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {

    // Vercel serves from the root; the old GitHub Pages build lived under /halara_menu_img/.
    const base = process.env.VERCEL || mode !== 'production' ? '/' : '/halara_menu_img/';

    return {
      base,
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      // No API key is compiled into the page: the server functions in api/ hold it.
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        outDir: 'dist',
        sourcemap: false,
      }
    };
});
