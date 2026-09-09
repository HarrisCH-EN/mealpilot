const { spawnSync } = require('node:child_process')
const { getConfig } = require('../config')

const config = getConfig()
const testDatabase = String(process.env.MYSQL_TEST_DATABASE || '').trim()
const businessDatabase = String(config.mysql.database || '').trim()

function fail(message) {
  console.error(`[integration safety] ${message}`)
  process.exit(1)
}

if (!testDatabase) fail('MYSQL_TEST_DATABASE 未配置，拒绝运行真实数据库测试')
if (!/test/i.test(testDatabase)) fail('MYSQL_TEST_DATABASE 名称必须包含 test')
if (!/^[A-Za-z0-9_]+$/.test(testDatabase)) fail('MYSQL_TEST_DATABASE 只能包含字母、数字和下划线')
if (testDatabase === businessDatabase) fail('MYSQL_TEST_DATABASE 不能等于 MYSQL_DATABASE')
if (process.env.PHASE_1C_ALLOW_DB_WRITES !== '1') fail('PHASE_1C_ALLOW_DB_WRITES 必须显式设置为 1')

console.log(`Business database: ${businessDatabase}`)
console.log(`Integration database: ${testDatabase}`)

const result = spawnSync(process.execPath, ['--test', 'test/integration/*.test.js'], {
  cwd: require('node:path').resolve(__dirname, '../..'),
  stdio: 'inherit',
  env: process.env
})

process.exitCode = result.status === null ? 1 : result.status
