const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..', '..', 'miniprogram')

test('login page is registered and presents the app identity plus every configured login option', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  const pageRoot = path.join(root, 'pages', 'login')
  const template = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
  const script = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')
  const styles = fs.readFileSync(path.join(pageRoot, 'index.wxss'), 'utf8')

  assert.ok(appConfig.pages.includes('pages/login/index'))
  assert.match(template, /assets\/brand\/logo\.png/)
  assert.match(template, /MealPilot/)
  assert.match(template, /饭有谱/)
  assert.match(template, /Plan less\. Eat better\./)
  assert.match(template, /bindtap="loginWithWechat"/)
  assert.match(template, /wx:if="\{\{allowDevLogin\}\}"[^>]*bindtap="loginWithDev"/)
  assert.match(script, /wechatLogin/)
  assert.match(script, /devLogin/)
  assert.match(script, /wx\.reLaunch\(\{\s*url:/)
  assert.match(styles, /\.login-brand__logo\s*\{[^}]*border-radius:\s*32rpx;/s)
})

test('business settings uses the shared gate instead of rendering a login state', () => {
  const settingsTemplate = fs.readFileSync(path.join(root, 'pages', 'settings', 'index.wxml'), 'utf8')
  const settingsScript = fs.readFileSync(path.join(root, 'pages', 'settings', 'index.js'), 'utf8')
  const api = fs.readFileSync(path.join(root, 'utils', 'api.js'), 'utf8')

  assert.doesNotMatch(settingsTemplate, /还没有登录|请使用微信登录|bindtap="goLogin"|bindtap="retryLogin"|本地开发登录/)
  assert.match(settingsScript, /requireAuthentication/)
  assert.match(api, /function redirectToLogin\(\)/)
  assert.match(api, /\/pages\/login\/index/)
})
