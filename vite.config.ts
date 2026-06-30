import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Required for Tauri: suppress Vite's own output so Tauri CLI can parse it.
  clearScreen: false,
  server: {
    port: 5173,
    // Fail if port 5173 is already occupied rather than switching to another port.
    strictPort: true,
  },
  // Expose VITE_ and TAURI_ env vars to the frontend.
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // Tauri uses Chromium on macOS/Linux and WebView2 on Windows — target accordingly.
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    // Minified sourcemaps are fine; keep them off in production for smaller bundles.
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
})
