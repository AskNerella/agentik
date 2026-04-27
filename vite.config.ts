import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dns from 'node:dns'

dns.setDefaultResultOrder('ipv4first')

const apiProxy = {
  target: 'http://localhost:8081',
  changeOrigin: false,
  secure: false,
  rewrite: (path: string) => path.replace(/^\/api/, ''),
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': apiProxy,
    },
  },
  preview: {
    proxy: {
      '/api': apiProxy,
    },
  },
})
