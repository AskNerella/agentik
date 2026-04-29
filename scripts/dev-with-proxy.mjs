import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const proxyRoot = resolve(root, '..', 'a2a-proxy')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const viteCommand = process.argv.includes('--preview') ? 'preview' : undefined

const processes = [
  spawn(npm, ['--prefix', proxyRoot, 'start'], { stdio: 'inherit' }),
  spawn('npx', ['vite', ...(viteCommand ? [viteCommand] : [])], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' }),
]

let shuttingDown = false

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of processes) {
    if (!child.killed) child.kill('SIGTERM')
  }
  process.exit(code)
}

for (const child of processes) {
  child.on('exit', (code) => {
    if (!shuttingDown && code !== 0) shutdown(code ?? 1)
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
