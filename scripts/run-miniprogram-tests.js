const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const projectRoot = path.resolve(__dirname, '..')
const testRoot = path.join(projectRoot, 'tests', 'miniprogram')

function collectTestFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectTestFiles(fullPath)
    return entry.isFile() && entry.name.endsWith('.test.js') ? [fullPath] : []
  })
}

const testFiles = collectTestFiles(testRoot).sort()
if (testFiles.length === 0) {
  console.error('No frontend test files found.')
  process.exitCode = 1
} else {
  const result = spawnSync(process.execPath, ['--test', ...testFiles], {
    cwd: projectRoot,
    stdio: 'inherit'
  })
  process.exitCode = result.status ?? 1
}
