import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const root = process.cwd()
const children = [
  spawn(process.execPath, ['--env-file-if-exists=.env.local', 'server/index.mjs'], {
    cwd: root,
    stdio: 'inherit',
  }),
  spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  }),
]

let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill()
  const force = setTimeout(() => {
    for (const child of children) {
      if (!child.killed) child.kill('SIGKILL')
    }
    process.exit(code)
  }, 2000)
  force.unref()
  Promise.all(children.map((child) => new Promise((resolve) => {
    if (child.exitCode !== null) resolve()
    else child.once('exit', resolve)
  }))).then(() => process.exit(code))
}
for (const child of children) child.on('exit', (code) => {
  if (!stopping && code) stop(code)
})
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
