import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dns from 'node:dns'

dns.setDefaultResultOrder('ipv4first')

const proxyApi = {
  target: 'http://localhost:8089',
  changeOrigin: false,
  secure: false,
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/proxy': proxyApi,
    },
  },
  preview: {
    proxy: {
      '/proxy': proxyApi,
    },
  },
})
