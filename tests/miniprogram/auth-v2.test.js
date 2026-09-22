const test = require('node:test')
const assert = require('node:assert/strict')
const { createAuthStore } = require('../../miniprogram/utils/auth-store')
const { createHttpClient } = require('../../miniprogram/utils/http-client')
const { createWechatAuth } = require('../../miniprogram/utils/wechat-auth')
const { createAuthService } = require('../../miniprogram/utils/auth-service')
const { createRouteGuard, nextRouteForSession } = require('../../miniprogram/utils/route-guard')

function makeStorage(token = '') {
  const values = { token }
  return {
    values,
    getStorageSync: () => values.token,
    setStorageSync: (_key, value) => { values.token = value },
    removeStorageSync: () => { values.token = '' }
  }
}

test('Auth V2 store keeps an incomplete profile authenticated', () => {
  const storage = makeStorage()
  const store = createAuthStore({ storage })

  store.hydrate()
  assert.equal(store.getState().status, 'unauthenticated')
  store.setSession({ token: 'jwt-token', user: { id: 7 }, profileComplete: false, membership: null })

  assert.equal(store.getState().status, 'authenticated')
  assert.equal(store.getState().profileComplete, false)
  assert.equal(storage.values.token, 'jwt-token')
})

test('Auth V2 bootstrap with no token does not silently call wx.login', async () => {
  const storage = makeStorage()
  const store = createAuthStore({ storage })
  let loginCalls = 0
  const client = createHttpClient({
    baseUrl: 'http://test/api',
    store,
    wxApi: { login: () => { loginCalls += 1 } },
    reauthenticate: async () => { loginCalls += 1 }
  })

  store.hydrate()
  assert.equal(store.getState().status, 'unauthenticated')
  assert.equal(loginCalls, 0)
  assert.equal(typeof client.request, 'function')
})

test('refreshing an authenticated session does not let page onShow redirect to login', async () => {
  const store = createAuthStore({ storage: makeStorage('jwt-token') })
  store.hydrate()
  store.setSession({
    token: 'jwt-token',
    user: { id: 7 },
    profileComplete: true,
    membership: null
  })

  let resolveSession
  const auth = createAuthService({
    store,
    wechatAuth: {},
    httpClient: {
      request: () => new Promise((resolve) => { resolveSession = resolve })
    }
  })
  const redirects = []
  const guard = createRouteGuard({
    store,
    wxApi: { reLaunch: ({ url }) => redirects.push(url) }
  })

  const refresh = auth.restoreSession()

  assert.equal(store.getState().status, 'authenticated')
  assert.equal(guard.requireAuthentication(), true)
  assert.deepEqual(redirects, [])

  resolveSession({ user: { id: 7 }, profileComplete: true, membership: null })
  await refresh
})

test('Auth V2 HTTP client shares one reauthentication across concurrent 401 responses and retries once', async () => {
  const storage = makeStorage('expired-token')
  const store = createAuthStore({ storage })
  store.hydrate()
  const attempts = new Map()
  let reauthCalls = 0
  const client = createHttpClient({
    baseUrl: 'http://test/api',
    store,
    wxApi: {
      request(options) {
        const path = options.url.split('/').pop()
        const count = (attempts.get(path) || 0) + 1
        attempts.set(path, count)
        setTimeout(() => options.success({
          statusCode: count === 1 ? 401 : 200,
          data: count === 1 ? { ok: false, code: 'AUTH_SESSION_EXPIRED', message: 'expired' } : { ok: true, data: { path } }
        }), 0)
      }
    },
    reauthenticate: async () => {
      reauthCalls += 1
      await new Promise((resolve) => setTimeout(resolve, 0))
      store.setSession({ token: 'fresh-token', user: { id: 7 }, profileComplete: false, membership: null })
      return store.getState()
    }
  })

  const results = await Promise.all([
    client.request('/protected/one'),
    client.request('/protected/two'),
    client.request('/protected/three')
  ])

  assert.equal(reauthCalls, 1)
  assert.deepEqual(results.map((result) => result.path), ['one', 'two', 'three'])
  assert.deepEqual([...attempts.values()], [2, 2, 2])
})

test('new incomplete user can recover a 401 and continue onboarding', async () => {
  const storage = makeStorage('expired-token')
  const store = createAuthStore({ storage })
  store.hydrate()
  let wxLoginCalls = 0
  let wechatLoginCalls = 0
  let authMeCalls = 0
  const wxApi = {
    login({ success }) {
      wxLoginCalls += 1
      setTimeout(() => success({ code: `onboarding-code-${wxLoginCalls}` }), 0)
    },
    request(options) {
      if (options.url.endsWith('/auth/me')) {
        authMeCalls += 1
        return setTimeout(() => options.success({ statusCode: 401, data: { ok: false, code: 'AUTH_SESSION_EXPIRED' } }), 0)
      }
      if (options.url.endsWith('/auth/wechat-login')) {
        wechatLoginCalls += 1
        return setTimeout(() => options.success({
          statusCode: 200,
          data: { ok: true, data: { token: 'fresh-token', user: { id: 7 }, profileComplete: false, membership: null } }
        }), 0)
      }
      return setTimeout(() => options.success({ statusCode: 200, data: { ok: true, data: { accepted: true } } }), 0)
    }
  }
  let auth
  const client = createHttpClient({
    baseUrl: 'http://test/api',
    store,
    wxApi,
    reauthenticate: () => auth.reauthenticate()
  })
  auth = createAuthService({ store, wechatAuth: createWechatAuth({ wxApi }), httpClient: client })

  const session = await auth.restoreSession()
  assert.equal(authMeCalls, 1)
  assert.equal(wxLoginCalls, 1)
  assert.equal(wechatLoginCalls, 1)
  assert.equal(session.status, 'authenticated')
  assert.equal(session.profileComplete, false)
  assert.equal((await client.request('/auth/profile', 'PATCH', { displayName: '新用户' })).accepted, true)
})

test('Wechat Auth gets a fresh code for every login attempt and rejects an empty code', async () => {
  let calls = 0
  const wechat = createWechatAuth({
    wxApi: {
      login({ success }) {
        calls += 1
        setTimeout(() => success({ code: `code-${calls}` }), 0)
      }
    }
  })

  assert.equal(await wechat.getLoginCode(), 'code-1')
  assert.equal(await wechat.getLoginCode(), 'code-2')
  await assert.rejects(
    createWechatAuth({ wxApi: { login({ success }) { success({ code: '' }) } } }).getLoginCode(),
    (error) => error.code === 'AUTH_WECHAT_CODE_INVALID'
  )
})

test('Route Guard separates authentication from profile completion and membership', () => {
  assert.equal(nextRouteForSession({ status: 'unauthenticated' }), '/pages/login/index')
  assert.equal(nextRouteForSession({ status: 'authenticated', profileComplete: false, membership: null }), '/pages/profile-setup/index')
  assert.equal(nextRouteForSession({ status: 'authenticated', profileComplete: true, membership: null }), '/pages/recommend/index')
})

test('Auth Service login and reauthentication preserve an authenticated incomplete profile', async () => {
  const store = createAuthStore({ storage: makeStorage() })
  const calls = []
  const auth = createAuthService({
    store,
    wechatAuth: { getLoginCode: async () => { calls.push('wx.login'); return 'fresh-code' } },
    httpClient: {
      request: async (path, method, data) => {
        calls.push(`${method} ${path}`)
        assert.equal(data.code, 'fresh-code')
        return { token: 'fresh-token', user: { id: 7 }, profileComplete: false, membership: null }
      }
    }
  })

  store.hydrate()
  const session = await auth.loginWithWechat()
  assert.equal(session.profileComplete, false)
  assert.equal(store.getState().status, 'authenticated')
  assert.deepEqual(calls, ['wx.login', 'POST /auth/wechat-login'])
  await auth.logout()
  assert.equal(store.getState().status, 'unauthenticated')
})
