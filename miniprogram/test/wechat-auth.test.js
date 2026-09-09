const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.join(__dirname, '..')
const api = fs.readFileSync(path.join(root, 'utils', 'api.js'), 'utf8')
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8')
const recommendation = fs.readFileSync(path.join(root, 'pages', 'recommend', 'index.js'), 'utf8')
const settings = fs.readFileSync(path.join(root, 'pages', 'settings', 'index.js'), 'utf8')
const settingsTemplate = fs.readFileSync(path.join(root, 'pages', 'settings', 'index.wxml'), 'utf8')
const config = fs.readFileSync(path.join(root, 'config.js'), 'utf8')

test('frontend centralizes API base and implements wx.login authentication', () => {
  assert.match(config, /apiBaseUrl/)
  assert.match(api, /require\(['"]\.\.\/config['"]\)/)
  assert.match(api, /wx\.login/)
  assert.match(api, /\/auth\/wechat-login/)
  assert.match(api, /reauth|re-auth/i)
  assert.doesNotMatch(api, /const BASE_URL\s*=\s*['"]http:\/\/127\.0\.0\.1:3000\/api['"]/) 
})

test('frontend has an explicit development-only dev login and no silent demo fallback', () => {
  assert.match(api, /allowDevLogin/)
  assert.match(api, /devLogin/) 
  assert.match(recommendation, /wechatLogin|ensureAuthenticated/)
  assert.doesNotMatch(recommendation, /await devLogin\(\)/)
  assert.match(settings, /devLogin/)
  assert.match(settingsTemplate, /allowDevLogin|本地开发登录/)
})

test('frontend session lifecycle persists and can clear JWT state', () => {
  assert.match(app, /wx\.getStorageSync\(['"]token['"]\)/)
  assert.match(app, /wx\.setStorageSync\(['"]token['"]/) 
  assert.match(app, /clearSession/) 
  assert.match(api, /statusCode\s*===\s*401|status\)\s*===\s*401/) 
})

test('production identity copy is not forced to say demo account', () => {
  assert.doesNotMatch(settingsTemplate, /settings-row__status">演示账号/) 
  assert.match(settingsTemplate, /allowDevLogin/) 
})

function createAuthHarness({ token = '', loginOutcomes = ['success'], meResponse = null } = {}) {
  const calls = { wxLogin: 0, wechatLogin: 0, me: 0 }
  const protectedAttempts = {}
  const states = []
  const storage = { token }
  const app = {
    globalData: {
      token,
      user: null,
      membership: null,
      authReady: false,
      authenticating: false,
      authError: null
    },
    setSession(data = {}) {
      if (Object.prototype.hasOwnProperty.call(data, 'token')) {
        this.globalData.token = data.token || ''
        storage.token = this.globalData.token
      }
      if (Object.prototype.hasOwnProperty.call(data, 'user')) this.globalData.user = data.user || null
      if (Object.prototype.hasOwnProperty.call(data, 'membership')) this.globalData.membership = data.membership || null
    },
    setAuthState(patch) {
      Object.assign(this.globalData, patch)
      states.push({ ...this.globalData })
    },
    clearSession() {
      this.globalData.token = ''
      this.globalData.user = null
      this.globalData.membership = null
      storage.token = ''
    }
  }
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
          data: { ok: true, data: { token: 'jwt-token', user: { id: 7 }, membership: null } }
        }), 0)
      }
      if (options.url.endsWith('/auth/me')) {
        calls.me += 1
        return setTimeout(() => options.success({
          statusCode: meResponse ? meResponse.statusCode : 200,
          data: meResponse ? meResponse.data : { ok: true, data: { user: { id: 7 }, membership: null } }
        }), 0)
      }
      if (options.url.includes('/protected/')) {
        const path = options.url.split('/').pop()
        protectedAttempts[path] = (protectedAttempts[path] || 0) + 1
        const expired = protectedAttempts[path] === 1
        return setTimeout(() => options.success({
          statusCode: expired ? 401 : 200,
          data: expired ? { ok: false, message: '登录已失效' } : { ok: true, data: { path } }
        }), 0)
      }
      throw new Error(`unexpected request: ${options.url}`)
    }
  }
  const module = { exports: {} }
  const source = fs.readFileSync(path.join(root, 'utils', 'api.js'), 'utf8')
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    require: (request) => request === '../config' ? { apiBaseUrl: 'http://test/api', allowDevLogin: true } : require(request),
    getApp: () => app,
    wx,
    setTimeout,
    clearTimeout,
    Promise,
    Object,
    Error,
    Set,
    URL,
    encodeURIComponent
  })
  return { api: module.exports, app, calls, states, protectedAttempts }
}

test('initial authentication deduplicates concurrent callers', async () => {
  const { api, calls, app } = createAuthHarness()
  const sessions = await Promise.all([
    api.ensureAuthenticated(),
    api.ensureAuthenticated(),
    api.ensureAuthenticated()
  ])
  assert.equal(calls.wxLogin, 1)
  assert.equal(calls.wechatLogin, 1)
  assert.equal(new Set(sessions).size, 1)
  assert.equal(app.globalData.token, 'jwt-token')
})

test('failed initial authentication clears the shared promise so retry can work', async () => {
  const { api, calls } = createAuthHarness({ loginOutcomes: ['failure', 'success'] })
  await assert.rejects(api.ensureAuthenticated(), /登录失败，请重试/)
  await api.ensureAuthenticated()
  assert.equal(calls.wxLogin, 2)
  assert.equal(calls.wechatLogin, 1)
})

test('force authentication bypasses /auth/me and shares one formal login', async () => {
  const { api, calls } = createAuthHarness({ token: 'old-token' })
  const sessions = await Promise.all([
    api.ensureAuthenticated({ force: true }),
    api.ensureAuthenticated({ force: true })
  ])
  assert.equal(calls.me, 0)
  assert.equal(calls.wxLogin, 1)
  assert.equal(calls.wechatLogin, 1)
  assert.equal(new Set(sessions).size, 1)
})

test('formal authentication exposes only safe normalized auth errors', async () => {
  const { api, app, states } = createAuthHarness({ loginOutcomes: ['failure'] })
  await assert.rejects(api.ensureAuthenticated(), /登录失败，请重试/)
  assert.equal(app.globalData.authReady, true)
  assert.equal(app.globalData.authenticating, false)
  assert.equal(typeof app.globalData.authError, 'string')
  assert.equal(states.some((state) => JSON.stringify(state).match(/session_key|Authorization|jwt-token|code-/i)), false)
})

test('auth state transitions from initial to authenticating to ready', async () => {
  const { api, app } = createAuthHarness()
  assert.equal(app.globalData.authReady, false)
  assert.equal(app.globalData.authenticating, false)
  const promise = api.ensureAuthenticated()
  await Promise.resolve()
  assert.equal(app.globalData.authenticating, true)
  await promise
  assert.equal(app.globalData.authReady, true)
  assert.equal(app.globalData.authenticating, false)
  assert.equal(app.globalData.authError, null)
})

test('concurrent 401 responses share one re-authentication and retry once', async () => {
  const { api, calls, protectedAttempts } = createAuthHarness({ token: 'expired-token' })
  const results = await Promise.all([
    api.request('/protected/one'),
    api.request('/protected/two'),
    api.request('/protected/three')
  ])
  assert.equal(calls.wxLogin, 1)
  assert.equal(calls.wechatLogin, 1)
  assert.deepEqual(results.map((result) => result.path), ['one', 'two', 'three'])
  assert.deepEqual(Object.values(protectedAttempts), [2, 2, 2])
})

test('settings exposes a formal retry entry separate from development login', () => {
  assert.match(settingsTemplate, /bindtap="retryLogin"/)
  assert.match(settings, /ensureAuthenticated\(\{\s*force:\s*true\s*\}\)/)
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
