const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const serverRoot = path.resolve(__dirname, '../..')
const testRoot = path.join(serverRoot, 'test')

function collectTests(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectTests(fullPath)
    if (!entry.isFile() || !entry.name.endsWith('.test.js')) return []
    return path.relative(serverRoot, fullPath).split(path.sep)[0] === 'test' && !fullPath.includes(`${path.sep}integration${path.sep}`) ? [fullPath] : []
  })
}

const files = collectTests(testRoot).sort()
if (!files.length) {
  console.error('未找到 Backend Direct tests')
  process.exit(1)
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: serverRoot,
  stdio: 'inherit',
  env: process.env
})

process.exitCode = result.status === null ? 1 : result.status
