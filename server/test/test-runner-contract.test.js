const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const serverRoot = path.resolve(__dirname, '..')
const root = path.resolve(serverRoot, '..')
const packageJson = JSON.parse(fs.readFileSync(path.join(serverRoot, 'package.json'), 'utf8'))

test('npm test defaults to the isolated Backend Direct suite', () => {
  assert.equal(packageJson.scripts.test, 'npm run test:direct')
  assert.equal(packageJson.scripts['test:direct'], 'node src/scripts/run-direct-tests.js')
})

test('real MySQL integration has an explicit runner and safety gate', () => {
  assert.equal(packageJson.scripts['test:integration'], 'node src/scripts/run-integration-tests.js')
  const runner = fs.readFileSync(path.join(serverRoot, 'src/scripts/run-integration-tests.js'), 'utf8')
  assert.match(runner, /MYSQL_TEST_DATABASE/)
  assert.match(runner, /PHASE_1C_ALLOW_DB_WRITES/)
  assert.match(runner, /MYSQL_TEST_DATABASE.*MYSQL_DATABASE|testDatabase.*businessDatabase/s)
  assert.match(runner, /test[\\/]integration[\\/]\*\.test\.js/)
})

test('demo catalog direct test contains no business database dependency', () => {
  const source = fs.readFileSync(path.join(serverRoot, 'test/demo-catalog.test.js'), 'utf8')
  assert.doesNotMatch(source, /mysql2\/promise|createConnection|MYSQL_DATABASE|config\.mysql/)
})

test('frontend exposes a built-in Node test command without extra dependencies', () => {
  const frontendPackage = JSON.parse(fs.readFileSync(path.join(root, 'tests/miniprogram/package.json'), 'utf8'))
  assert.equal(frontendPackage.scripts.test, 'node ../../scripts/run-miniprogram-tests.js')
  assert.match(
    fs.readFileSync(path.join(root, 'scripts/run-miniprogram-tests.js'), 'utf8'),
    /--test/
  )
})
