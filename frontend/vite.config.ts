import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev server proxies /api to the FastAPI backend. In production the backend
// mounts frontend/dist at "/", so every API call uses a relative "/api" URL.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: false },
    },
  },
  // One offline SPA bundle (MapLibre + Recharts) is fine here; no code splitting needed.
  build: { chunkSizeWarningLimit: 2000 },
})
