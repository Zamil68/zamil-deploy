import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/new/',
  plugins: [react(), tailwindcss()],
  build: { 
    outDir: 'dist', 
    sourcemap: false, 
    chunkSizeWarningLimit: 900 
  },
  server: { 
    proxy: { 
      '/api': 'http://127.0.0.1:8787' 
    } 
  }
});
