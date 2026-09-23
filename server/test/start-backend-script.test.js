const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('root launcher enters server, validates setup, and starts the development server', () => {
  const launcherPath = path.resolve(__dirname, '..', '..', 'start-mealpilot-api.bat')
  assert.equal(fs.existsSync(launcherPath), true, '应提供根目录双击启动脚本')

  const launcher = fs.readFileSync(launcherPath, 'utf8')
  const launcherBytes = fs.readFileSync(launcherPath)
  assert.ok(launcherBytes.includes(Buffer.from('\r\n')), 'Windows 批处理脚本必须使用 CRLF 换行')
  assert.match(launcher, /cd \/d "%SERVER_ROOT%"/i)
  assert.match(launcher, /if not exist "%SERVER_ROOT%\\\.env"/i)
  assert.match(launcher, /call npm install/i)
  assert.match(launcher, /call npm run db:migrate/i)
  assert.match(launcher, /call npm run dev/i)
  assert.match(launcher, /pause/i)
})
