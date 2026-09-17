const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.join(__dirname, '..')

const protectedPages = [
  'recommend',
  'menu',
  'recipes',
  'settings',
  'recipe-detail',
  'recipe-form',
  'tag-management',
  'restrictions',
  'about',
  'family-management',
  'account-management'
]

test('the app starts on the login page without a launch-time relaunch', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8')
  const login = fs.readFileSync(path.join(root, 'pages', 'login', 'index.js'), 'utf8')

  assert.equal(appConfig.pages[0], 'pages/login/index')
  assert.match(app, /wx\.getStorageSync\(['"]token['"]\)/)
  assert.doesNotMatch(app, /wx\.reLaunch\(/)
  assert.match(login, /ensureAuthenticated/)
  assert.match(login, /\/pages\/recommend\/index/)
  assert.match(login, /if \(this\._redirecting\) return/)
})

test('every business page applies the shared authentication gate before rendering', () => {
  for (const page of protectedPages) {
    const script = fs.readFileSync(path.join(root, 'pages', page, 'index.js'), 'utf8')
    assert.match(script, /requireAuthentication/, `${page} page must use the auth gate`)
  }
})

test('business pages no longer render an unauthenticated settings state', () => {
  const settingsTemplate = fs.readFileSync(path.join(root, 'pages', 'settings', 'index.wxml'), 'utf8')
  const settingsScript = fs.readFileSync(path.join(root, 'pages', 'settings', 'index.js'), 'utf8')

  assert.doesNotMatch(settingsTemplate, /还没有登录|请使用微信登录|bindtap="goLogin"|bindtap="retryLogin"|本地开发登录/)
  assert.doesNotMatch(settingsScript, /loggedOut|goLogin\(|retryLogin\(|devLogin/)
})

test('logout clears the session and relaunches the dedicated login page', () => {
  const accountScript = fs.readFileSync(path.join(root, 'pages', 'account-management', 'index.js'), 'utf8')

  assert.match(accountScript, /app\.clearSession\(\)/)
  assert.match(accountScript, /wx\.reLaunch\(\{\s*url:\s*['"]\/pages\/login\/index['"]\s*\}\)/)
  assert.doesNotMatch(accountScript, /\/pages\/settings\/index\?loggedOut=1/)
})

function loadApi({ token = '', authReady = Boolean(token) } = {}) {
  const calls = { redirects: [] }
  const storage = { token }
  const app = {
    globalData: { token, authReady, user: { id: 1 }, membership: { family_id: 2 } },
    clearSession() {
      this.globalData.token = ''
      this.globalData.user = null
      this.globalData.membership = null
      storage.token = ''
    },
    setAuthState() {},
    setSession() {}
  }
  const wx = {
    getStorageSync: () => storage.token,
    removeStorageSync: () => { storage.token = '' },
    reLaunch: (options) => calls.redirects.push(options.url)
  }
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'utils', 'api.js'), 'utf8'), {
    module,
    exports: module.exports,
    require: (request) => request === '../config' ? { apiBaseUrl: 'http://test/api', allowDevLogin: true } : require(request),
    getApp: () => app,
    getCurrentPages: () => [{ route: 'pages/menu/index' }],
    wx,
    Promise,
    Error,
    Object,
    Set,
    URL,
    encodeURIComponent
  })
  return { api: module.exports, app, calls }
}

test('the shared gate redirects unauthenticated direct page access and clears the session', () => {
  const { api, app, calls } = loadApi({ token: '' })

  assert.equal(api.requireAuthentication(), false)
  assert.equal(app.globalData.token, '')
  assert.deepEqual(calls.redirects, ['/pages/login/index'])
})

test('the shared gate allows business pages with a persisted session', () => {
  const { api } = loadApi({ token: 'jwt-token' })

  assert.equal(api.requireAuthentication(), true)
})

test('the shared gate rejects a token that has not completed session validation', () => {
  const { api, calls } = loadApi({ token: 'jwt-token', authReady: false })

  assert.equal(api.requireAuthentication(), false)
  assert.deepEqual(calls.redirects, ['/pages/login/index'])
})

test('an authentication session that remains unauthorized after reauthentication returns to login', () => {
  const apiSource = fs.readFileSync(path.join(root, 'utils', 'api.js'), 'utf8')
  const ensureBlock = apiSource.match(/async function ensureAuthenticated[\s\S]*?\n}\n\nasync function devLogin/)

  assert.ok(ensureBlock)
  assert.match(ensureBlock[0], /if \(safeError\.status === 401\) redirectToLogin\(\)/)
})
