const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..', '..', 'miniprogram')
const { validateDisplayName } = require('../../miniprogram/utils/profile')

test('profile display name validation is shared by onboarding and account management', () => {
  assert.equal(validateDisplayName(''), '请先填写昵称')
  assert.equal(validateDisplayName('a'.repeat(41)), '昵称不能超过40个字符')
  assert.equal(validateDisplayName('小明'), '')
})

test('profile setup is a registered authenticated page using current WeChat profile APIs', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  const pageRoot = path.join(root, 'pages', 'profile-setup')
  const template = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
  const script = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')

  assert.ok(appConfig.pages.includes('pages/profile-setup/index'))
  assert.match(template, /open-type="chooseAvatar"/)
  assert.match(template, /bindchooseavatar="onChooseAvatar"/)
  assert.match(template, /type="nickname"/)
  assert.match(template, /bindinput="onNicknameInput"/)
  assert.match(script, /uploadAvatar\(/)
  assert.match(script, /request\(['"]\/auth\/profile['"],\s*['"]PATCH['"]/) 
  assert.match(script, /request\(['"]\/auth\/me['"]/) 
  assert.match(script, /profileComplete/)
  assert.doesNotMatch(template, /getUserInfo|scope\.userInfo/)
  assert.doesNotMatch(script, /getUserProfile|getUserInfo/)
})

test('login delegates incomplete sessions to the profile setup route', () => {
  const script = fs.readFileSync(path.join(root, 'pages', 'login', 'index.js'), 'utf8')
  const template = fs.readFileSync(path.join(root, 'pages', 'login', 'index.wxml'), 'utf8')

  assert.match(script, /nextRouteForSession/)
  assert.match(script, /\/pages\/profile-setup\/index/)
  assert.doesNotMatch(script, /profilePrompt|onChooseAvatar|uploadAvatar/)
  assert.doesNotMatch(template, /open-type="chooseAvatar"|type="nickname"/)
})
