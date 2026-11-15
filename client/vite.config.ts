import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        configure: (proxy) => {
          proxy.on('error', (_error, _req, res) => {
            if (!res || !('writeHead' in res) || res.headersSent) return;
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                error:
                  'The LeaveDesk API is not reachable right now. Make sure the server is running (npm run dev), then try again.',
              }),
            );
          });
        },
      },
    },
  },
});
