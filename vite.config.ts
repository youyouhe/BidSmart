import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          // Proxy API requests to local PageIndex server to avoid CORS
          '/api': {
            target: env.VITE_PAGEINDEX_API_URL || 'http://localhost:8003',
            changeOrigin: true,
          },
          // Proxy WebSocket connections to local PageIndex server
          '/ws': {
            target: env.VITE_PAGEINDEX_API_URL || 'http://localhost:8003',
            changeOrigin: true,
            ws: true,
          },
          // Proxy OCR service requests
          '/ocr': {
            target: env.VITE_OCR_SERVICE_URL || 'http://localhost:8010',
            changeOrigin: true,
          }
        }
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
