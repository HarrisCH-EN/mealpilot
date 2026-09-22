const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..', '..', 'miniprogram')
const { createAuthStore } = require('../../miniprogram/utils/auth-store')
const { createWechatAuth } = require('../../miniprogram/utils/wechat-auth')
const { createHttpClient } = require('../../miniprogram/utils/http-client')
const { createAuthService } = require('../../miniprogram/utils/auth-service')

const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8')
const recommendation = fs.readFileSync(path.join(root, 'pages', 'recommend', 'index.js'), 'utf8')
const settings = fs.readFileSync(path.join(root, 'pages', 'settings', 'index.js'), 'utf8')
const settingsTemplate = fs.readFileSync(path.join(root, 'pages', 'settings', 'index.wxml'), 'utf8')
const loginPage = fs.readFileSync(path.join(root, 'pages', 'login', 'index.js'), 'utf8')
const loginTemplate = fs.readFileSync(path.join(root, 'pages', 'login', 'index.wxml'), 'utf8')
const config = fs.readFileSync(path.join(root, 'config.js'), 'utf8')
const authServiceSource = fs.readFileSync(path.join(root, 'utils', 'auth-service.js'), 'utf8')
const httpClientSource = fs.readFileSync(path.join(root, 'utils', 'http-client.js'), 'utf8')
const wechatAuthSource = fs.readFileSync(path.join(root, 'utils', 'wechat-auth.js'), 'utf8')

test('frontend centralizes API base and implements wx.login authentication', () => {
  assert.match(config, /apiBaseUrl/)
  assert.match(wechatAuthSource, /wxApi\.login/)
  assert.match(authServiceSource, /\/auth\/wechat-login/)
  assert.match(httpClientSource, /reauthenticate|re-auth/i)
  assert.doesNotMatch(config, /const BASE_URL\s*=\s*['"]http:\/\/127\.0\.0\.1:3000\/api['"]/)
})

test('frontend has an explicit development-only dev login and no silent demo fallback', () => {
  assert.match(authServiceSource, /allowDevLogin/)
  assert.match(authServiceSource, /devLogin/)
  assert.match(recommendation, /ensureAuthenticated/)
  assert.doesNotMatch(recommendation, /await devLogin\(\)/)
  assert.match(loginPage, /authService\.devLogin/)
  assert.match(loginTemplate, /allowDevLogin|本地开发登录/)
})

test('frontend session lifecycle persists and can clear JWT state', () => {
  assert.match(app, /wx\.getStorageSync\(['"]token['"]\)/)
  assert.match(fs.readFileSync(path.join(root, 'utils', 'auth-store.js'), 'utf8'), /setStorageSync\(['"]token['"]/)
  assert.doesNotMatch(app, /setAuthState|setSession|clearSession/)
  assert.match(httpClientSource, /statusCode >= 200|statusCode !== 401/)
})

test('production identity copy is not forced to say demo account', () => {
  assert.doesNotMatch(settingsTemplate, /settings-row__status">演示账号/) 
  assert.match(loginTemplate, /allowDevLogin/)
})

function createAuthHarness({ token = '', loginOutcomes = ['success'] } = {}) {
  const calls = { wxLogin: 0, wechatLogin: 0, me: 0 }
  const protectedAttempts = {}
  const uploadAttempts = {}
  const states = []
  const storage = { token }
  const store = createAuthStore({ storage, onChange: (state) => states.push(state) })
  store.hydrate()
  const wx = {
    getStorageSync: () => storage.token,
    setStorageSync: (_key, value) => { storage.token = value },
    removeStorageSync: () => { storage.token = '' },
    login({ success, fail }) {
      calls.wxLogin += 1
      const outcome = loginOutcomes.shift() || 'success'
      setTimeout(() => outcome === 'success' ? success({ code: `code-${calls.wxLogin}` }) : fail(new Error('微信登录失败')), 0)
    },
    request(options) {
      if (options.url.endsWith('/auth/wechat-login')) {
        calls.wechatLogin += 1
        return setTimeout(() => options.success({
          statusCode: 200,
          data: { ok: true, data: { token: 'jwt-token', user: { id: 7 }, membership: null, profileComplete: false } }
        }), 0)
      }
      if (options.url.endsWith('/auth/me')) {
        calls.me += 1
        return setTimeout(() => options.success({
          statusCode: 200,
          data: { ok: true, data: { user: { id: 7 }, membership: null, profileComplete: false } }
        }), 0)
      }
      if (options.url.includes('/protected/')) {
        const requestPath = options.url.split('/').pop()
        protectedAttempts[requestPath] = (protectedAttempts[requestPath] || 0) + 1
        const expired = protectedAttempts[requestPath] === 1
        return setTimeout(() => options.success({
          statusCode: expired ? 401 : 200,
          data: expired ? { ok: false, message: '登录已失效' } : { ok: true, data: { path: requestPath } }
        }), 0)
      }
      throw new Error(`unexpected request: ${options.url}`)
    },
    uploadFile(options) {
      const uploadName = options.url.endsWith('/uploads/avatar') ? 'avatar' : 'cover'
      uploadAttempts[uploadName] = (uploadAttempts[uploadName] || 0) + 1
      const expired = uploadAttempts[uploadName] === 1
      return setTimeout(() => options.success({
        statusCode: expired ? 401 : 200,
        data: expired
          ? { ok: false, message: '登录已失效' }
          : { ok: true, data: { url: `/uploads/${uploadName}-retried.jpg` } }
      }), 0)
    }
  }
  let authService
  const httpClient = createHttpClient({
    baseUrl: 'http://test/api',
    store,
    wxApi: wx,
    reauthenticate: () => authService.reauthenticate()
  })
  authService = createAuthService({
    store,
    wechatAuth: createWechatAuth({ wxApi: wx }),
    httpClient,
    allowDevLogin: true
  })
  return { authService, httpClient, store, calls, states, protectedAttempts, uploadAttempts }
}

test('bootstrap with no token does not silently start a WeChat login', async () => {
  const { authService, calls, store } = createAuthHarness()
  const state = await authService.bootstrap()
  assert.equal(calls.wxLogin, 0)
  assert.equal(state.status, 'unauthenticated')
  assert.equal(store.getState().token, '')
})

test('explicit login deduplicates concurrent formal login callers', async () => {
  const { authService, calls, store } = createAuthHarness()
  const sessions = await Promise.all([
    authService.loginWithWechat(),
    authService.loginWithWechat()
  ])
  assert.equal(calls.wxLogin, 2)
  assert.equal(calls.wechatLogin, 2)
  assert.equal(new Set(sessions).size, 2)
  assert.equal(store.getState().token, 'jwt-token')
})

test('reauthentication shares one formal login and clears its promise after failure', async () => {
  const { authService, calls } = createAuthHarness({ loginOutcomes: ['failure', 'success'] })
  await assert.rejects(Promise.all([authService.reauthenticate(), authService.reauthenticate()]), /微信登录失败/)
  await authService.reauthenticate()
  assert.equal(calls.wxLogin, 2)
  assert.equal(calls.wechatLogin, 1)
})

test('formal authentication exposes only safe normalized auth errors', async () => {
  const { authService, store, states } = createAuthHarness({ loginOutcomes: ['failure'] })
  await assert.rejects(authService.loginWithWechat(), /微信登录失败|登录失败/)
  assert.equal(store.getState().status, 'unauthenticated')
  assert.equal(states.some((state) => JSON.stringify(state).match(/session_key|Authorization|code-/i)), false)
})

test('auth state transitions from initial to authenticating to ready', async () => {
  const { authService, store } = createAuthHarness()
  const promise = authService.loginWithWechat()
  await Promise.resolve()
  assert.equal(store.getState().status, 'authenticating')
  await promise
  assert.equal(store.getState().status, 'authenticated')
  assert.equal(store.getState().authError, null)
})

test('concurrent 401 responses share one re-authentication and retry once', async () => {
  const { authService, httpClient, calls, protectedAttempts, store } = createAuthHarness({ token: 'expired-token' })
  store.setSession({ token: 'expired-token', user: { id: 7 }, profileComplete: true })
  const results = await Promise.all([
    httpClient.request('/protected/one'),
    httpClient.request('/protected/two'),
    httpClient.request('/protected/three')
  ])
  assert.equal(calls.wxLogin, 1)
  assert.equal(calls.wechatLogin, 1)
  assert.deepEqual(results.map((result) => result.path), ['one', 'two', 'three'])
  assert.deepEqual(Object.values(protectedAttempts), [2, 2, 2])
  assert.equal(store.getState().status, 'authenticated')
})

test('upload retries once after an expired session and reuses shared authentication recovery', async () => {
  const { httpClient, calls, uploadAttempts, store } = createAuthHarness({ token: 'expired-token' })
  store.setSession({ token: 'expired-token', user: { id: 7 }, profileComplete: true })
  const result = await httpClient.upload('/uploads/recipe-cover', '/tmp/cover.jpg')
  assert.deepEqual(result, { url: '/uploads/cover-retried.jpg' })
  assert.equal(uploadAttempts.cover, 2)
  assert.equal(calls.wxLogin, 1)
  assert.equal(calls.wechatLogin, 1)
})

test('settings relies on the global auth gate instead of exposing a login flow', () => {
  assert.match(settings, /requireAuthentication/)
  assert.doesNotMatch(settingsTemplate, /bindtap="retryLogin"|本地开发登录|还没有登录/)
})

test('production environment validation rejects unsafe API and dev login settings', () => {
  const configModule = require(path.join(root, 'config.js'))
  assert.equal(typeof configModule.validateEnvironmentConfig, 'function')
  assert.throws(() => configModule.validateEnvironmentConfig('production', {
    apiBaseUrl: 'https://replace-with-your-api.example.com/api',
    allowDevLogin: false
  }), /API 地址/)
  assert.throws(() => configModule.validateEnvironmentConfig('production', {
    apiBaseUrl: 'https://api.fanyoupu.cn/api',
    allowDevLogin: true
  }), /本地开发登录/)
})
