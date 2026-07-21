import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Dev: chuyển /api sang backend Express (chạy `node server/index.cjs` trước)
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
