const test = require('node:test')
const assert = require('node:assert/strict')
const { createApp } = require('../src/app')
const { createRuntimeApp } = require('../src/server')
const { createToken, readToken } = require('../src/auth')
const { findOrCreateWechatUser } = require('../src/routes/auth-family')
const { createWechatAuthService, WechatAuthError } = require('../src/services/wechat-auth-service')

async function withServer(app, callback) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance))
  })
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

function databaseForUser(user = { id: 7, openid: 'openid-new', display_name: '微信用户', avatar_url: '' }) {
  const calls = []
  return {
    calls,
    async execute(sql, params) {
      calls.push({ sql, params })
      if (/INSERT INTO users/i.test(sql)) return [{ insertId: user.id, affectedRows: 1 }]
      if (/SELECT id, openid, display_name, avatar_url FROM users WHERE openid/i.test(sql)) return [[user]]
      if (/FROM family_members fm JOIN families f/i.test(sql)) return [[]]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
}

test('wechat-login exchanges code, creates a User, and returns the existing JWT session contract', async () => {
  const database = databaseForUser()
  let receivedCode = null
  const app = createApp({
    database,
    jwtSecret: 'wechat-test-secret',
    devAuthEnabled: false,
    wechatAuthService: {
      exchangeCodeForSession: async (code) => {
        receivedCode = code
        return { openid: 'openid-new', sessionKey: 'secret-session-key' }
      }
    }
  })

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/wechat-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'wx-code-1' })
    })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(receivedCode, 'wx-code-1')
    assert.equal(body.data.user.openid, 'openid-new')
    assert.equal(body.data.membership, null)
    assert.equal(body.data.sessionKey, undefined)
    assert.equal(body.data.user.session_key, undefined)
    assert.deepEqual(readToken(body.data.token, 'wechat-test-secret'), { userId: 7, openid: 'openid-new' })
    assert.match(database.calls.find((call) => /INSERT INTO users/i.test(call.sql)).sql, /ON DUPLICATE KEY UPDATE/i)
  })
})

test('wechat-login validates the code before calling WeChat or the database', async () => {
  const database = databaseForUser()
  let called = false
  const app = createApp({
    database,
    jwtSecret: 'wechat-test-secret',
    wechatAuthService: {
      exchangeCodeForSession: async () => { called = true }
    }
  })

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/wechat-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 123 })
    })
    assert.equal(response.status, 400)
    assert.equal(called, false)
    assert.equal(database.calls.length, 0)
  })
})

test('wechat-login rejects an oversized code before calling the provider', async () => {
  const database = databaseForUser()
  let called = false
  const app = createApp({
    database,
    jwtSecret: 'wechat-test-secret',
    wechatAuthService: {
      exchangeCodeForSession: async () => { called = true }
    }
  })

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/wechat-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'x'.repeat(257) })
    })
    assert.equal(response.status, 400)
    assert.equal(called, false)
    assert.equal(database.calls.length, 0)
  })
})

test('malformed JSON returns a safe 400 response', async () => {
  const app = createApp({ database: databaseForUser(), jwtSecret: 'wechat-test-secret' })
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/wechat-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"code":'
    })
    assert.equal(response.status, 400)
    const body = await response.json()
    assert.deepEqual(body, { ok: false, message: '请求 JSON 格式不正确' })
  })
})

test('wechat-login maps invalid WeChat credentials to 401 without leaking internals', async () => {
  const app = createApp({
    database: databaseForUser(),
    jwtSecret: 'wechat-test-secret',
    wechatAuthService: {
      exchangeCodeForSession: async () => { throw new WechatAuthError('invalid-code', 'raw provider detail') }
    }
  })

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/wechat-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'bad-code' })
    })
    assert.equal(response.status, 401)
    const body = await response.json()
    assert.deepEqual(body, { ok: false, message: '微信登录凭证无效' })
    assert.doesNotMatch(JSON.stringify(body), /raw provider detail|secret|session/i)
  })
})

test('wechat-login remains available when dev-login is disabled', async () => {
  const app = createApp({
    database: databaseForUser({ id: 8, openid: 'openid-production', display_name: '微信用户', avatar_url: '' }),
    jwtSecret: 'wechat-test-secret',
    devAuthEnabled: false,
    wechatAuthService: { exchangeCodeForSession: async () => ({ openid: 'openid-production' }) }
  })

  await withServer(app, async (baseUrl) => {
    const wechatResponse = await fetch(`${baseUrl}/api/auth/wechat-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'valid-code' })
    })
    const devResponse = await fetch(`${baseUrl}/api/auth/dev-login`, { method: 'POST' })
    assert.equal(wechatResponse.status, 200)
    assert.equal(devResponse.status, 404)
  })
})

test('normal runtime wiring passes WeChat credentials and injectable client to the App', async () => {
  const database = databaseForUser({ id: 9, openid: 'openid-runtime', display_name: '微信用户', avatar_url: '' })
  const app = createRuntimeApp({
    jwtSecret: 'runtime-wechat-secret',
    devAuthEnabled: false,
    wechatAppId: 'wx-runtime-app',
    wechatAppSecret: 'runtime-secret',
    wechatAuthService: { exchangeCodeForSession: async () => ({ openid: 'openid-runtime' }) }
  }, database).app
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/wechat-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'runtime-code' })
    })
    assert.equal(response.status, 200)
    assert.deepEqual(readToken((await response.json()).data.token, 'runtime-wechat-secret'), { userId: 9, openid: 'openid-runtime' })
  })
})

test('Wechat client exchanges code without exposing credentials or session key', async () => {
  let requestedUrl = ''
  const service = createWechatAuthService({
    appId: 'wx-test-app',
    appSecret: 'test-secret',
    fetchImpl: async (url) => {
      requestedUrl = String(url)
      return { ok: true, json: async () => ({ openid: 'openid-1', session_key: 'session-1', unionid: 'union-1' }) }
    }
  })
  const result = await service.exchangeCodeForSession('temporary-code')
  assert.deepEqual(result, { openid: 'openid-1', unionid: 'union-1', sessionKey: 'session-1' })
  assert.match(requestedUrl, /appid=wx-test-app/)
  assert.match(requestedUrl, /secret=test-secret/)
  assert.match(requestedUrl, /js_code=temporary-code/)
})

test('Wechat client classifies provider and configuration failures', async () => {
  await assert.rejects(
    createWechatAuthService({ appId: '', appSecret: '', fetchImpl: async () => ({}) }).exchangeCodeForSession('code'),
    (error) => error instanceof WechatAuthError && error.kind === 'config'
  )
  await assert.rejects(
    createWechatAuthService({ appId: 'app', appSecret: 'secret', fetchImpl: async () => ({ ok: true, json: async () => ({ errcode: 40029 }) }) }).exchangeCodeForSession('code'),
    (error) => error instanceof WechatAuthError && error.kind === 'invalid-code'
  )
  await assert.rejects(
    createWechatAuthService({ appId: 'app', appSecret: 'secret', fetchImpl: async () => { throw new Error('network') } }).exchangeCodeForSession('code'),
    (error) => error instanceof WechatAuthError && error.kind === 'unavailable'
  )
})

test('Wechat client maps an Abort timeout to an unavailable provider error', async () => {
  const service = createWechatAuthService({
    appId: 'app',
    appSecret: 'secret',
    timeoutMs: 5,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')))
    })
  })
  await assert.rejects(
    service.exchangeCodeForSession('code'),
    (error) => error instanceof WechatAuthError && error.kind === 'unavailable'
  )
})

test('concurrent openid upserts resolve to one logical User', async () => {
  const calls = []
  const database = {
    async execute(sql, params) {
      calls.push({ sql, params })
      if (/INSERT INTO users/i.test(sql)) return [{ insertId: 12, affectedRows: 1 }]
      if (/SELECT id, openid, display_name, avatar_url FROM users WHERE openid/i.test(sql)) return [[{ id: 12, openid: 'same-openid', display_name: '微信用户', avatar_url: '' }]]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
  const users = await Promise.all([
    findOrCreateWechatUser(database, { openid: 'same-openid' }),
    findOrCreateWechatUser(database, { openid: 'same-openid' })
  ])
  assert.deepEqual(users.map((user) => user.id), [12, 12])
  assert.equal(calls.filter((call) => /INSERT INTO users/i.test(call.sql)).length, 2)
})
