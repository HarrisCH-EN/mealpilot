const test = require('node:test')
const assert = require('node:assert/strict')
const { createAuthStore } = require('../../miniprogram/utils/auth-store')
const { createHttpClient } = require('../../miniprogram/utils/http-client')

function createStore(token = 'jwt-token') {
  const storage = { token }
  const store = createAuthStore({ storage })
  store.hydrate()
  if (token) store.setSession({ token, user: { id: 7 }, profileComplete: true })
  return store
}

function cloudWx({ responses = [], failures = [] } = {}) {
  const calls = []
  return {
    calls,
    cloud: {
      callContainer(options) {
        calls.push(options)
        const failure = failures.shift()
        if (failure) return setTimeout(() => options.fail(failure), 0)
        const response = responses.length ? responses.shift() : { statusCode: 200, data: { ok: true, data: { ok: true } } }
        setTimeout(() => options.success(response), 0)
      }
    }
  }
}

test('cloud transport calls the service path with JWT and service header', async () => {
  const wx = cloudWx({ responses: [{ statusCode: 200, data: { ok: true, data: { id: 7 } } }] })
  const client = createHttpClient({
    transport: 'cloud',
    baseUrl: 'https://legacy.example/api',
    cloudEnvId: 'cloud1-test',
    cloudServiceName: 'mealpilot-api',
    cloudApiPrefix: '/api',
    store: createStore(),
    wxApi: wx
  })

  const result = await client.request('/auth/me')
  assert.deepEqual(result, { id: 7 })
  assert.equal(wx.calls.length, 1)
  assert.equal(wx.calls[0].path, '/api/auth/me')
  assert.deepEqual(wx.calls[0].config, { env: 'cloud1-test' })
  assert.equal(wx.calls[0].method, 'GET')
  assert.equal(wx.calls[0].header['X-WX-SERVICE'], 'mealpilot-api')
  assert.equal(wx.calls[0].header.Authorization, 'Bearer jwt-token')
})

test('cloud auth endpoint can be called without JWT while protected endpoints require it', async () => {
  const wx = cloudWx({ responses: [{ statusCode: 200, data: { ok: true, data: { token: 'new-token' } } }] })
  const client = createHttpClient({
    transport: 'cloud', cloudEnvId: 'env', cloudServiceName: 'mealpilot-api', cloudApiPrefix: '/api',
    store: createStore(''), wxApi: wx
  })
  await client.request('/auth/wechat-login', 'POST', { code: 'code-1' }, { skipAuth: true, skipReauth: true })
  assert.equal(wx.calls[0].path, '/api/auth/wechat-login')
  assert.equal(wx.calls[0].header['X-WX-SERVICE'], 'mealpilot-api')
  await assert.rejects(client.request('/recipes'), (error) => error.code === 'AUTH_REQUIRED')
})

test('cloud 401 reauthenticates once and retries the original request', async () => {
  const wx = cloudWx({ responses: [
    { statusCode: 401, data: { ok: false, message: '登录已失效' } },
    { statusCode: 200, data: { ok: true, data: { recipes: [] } } }
  ] })
  const store = createStore('expired-token')
  let reauthCalls = 0
  const client = createHttpClient({
    transport: 'cloud', cloudEnvId: 'env', cloudServiceName: 'mealpilot-api', cloudApiPrefix: '/api', store, wxApi: wx,
    reauthenticate: async () => { reauthCalls += 1; store.setSession({ token: 'fresh-token' }) }
  })
  const result = await client.request('/recipes')
  assert.deepEqual(result, { recipes: [] })
  assert.equal(reauthCalls, 1)
  assert.equal(wx.calls.length, 2)
  assert.equal(wx.calls[1].header.Authorization, 'Bearer fresh-token')
})

test('cloud transport failure preserves errMsg and code', async () => {
  const wx = cloudWx({ failures: [{ errMsg: 'cloud.callContainer:fail timeout', code: 'CLOUD_TIMEOUT' }] })
  const client = createHttpClient({
    transport: 'cloud', cloudEnvId: 'env', cloudServiceName: 'mealpilot-api', cloudApiPrefix: '/api', store: createStore(), wxApi: wx
  })
  await assert.rejects(client.request('/recipes'), (error) => {
    assert.equal(error.message, 'cloud.callContainer:fail timeout')
    assert.equal(error.errMsg, 'cloud.callContainer:fail timeout')
    assert.equal(error.code, 'CLOUD_TIMEOUT')
    return true
  })
})

test('cloud upload prepares, uploads with CloudBase, then commits without sending image bytes to Backend', async () => {
  const wx = cloudWx({ responses: [
    { statusCode: 200, data: { ok: true, data: { cloudPath: 'staging/users/7/avatars/server-uuid' } } },
    { statusCode: 201, data: { ok: true, data: { user: { avatarFileId: 'cloud://bucket/users/7/avatars/final.png' } } } }
  ] })
  const uploads = []
  wx.cloud.uploadFile = (options) => {
    uploads.push(options)
    options.success({ fileID: 'cloud://bucket/staging/users/7/avatars/server-uuid' })
  }
  wx.getFileSystemManager = () => { throw new Error('binary read must not be used') }
  const client = createHttpClient({ transport: 'cloud', cloudEnvId: 'env', cloudServiceName: 'mealpilot-api', store: createStore(), wxApi: wx })
  const result = await client.upload('/uploads/avatar', '/tmp/avatar.png')
  assert.deepEqual(result, { user: { avatarFileId: 'cloud://bucket/users/7/avatars/final.png' } })
  assert.deepEqual(wx.calls.map(call => call.path), ['/api/uploads/avatar/prepare', '/api/uploads/avatar/commit'])
  assert.equal(wx.calls[0].header.Authorization, 'Bearer jwt-token')
  assert.equal(wx.calls[1].header.Authorization, 'Bearer jwt-token')
  assert.deepEqual(wx.calls[0].data, {})
  assert.deepEqual(wx.calls[1].data, { fileId: 'cloud://bucket/staging/users/7/avatars/server-uuid' })
  assert.equal(uploads[0].cloudPath, 'staging/users/7/avatars/server-uuid')
  assert.equal(uploads[0].filePath, '/tmp/avatar.png')
})

test('production config requires cloud transport credentials and development accepts HTTP', () => {
  const { validateEnvironmentConfig } = require('../../miniprogram/config')
  assert.doesNotThrow(() => validateEnvironmentConfig('development', {
    transport: 'http', apiBaseUrl: 'http://127.0.0.1:3000/api', allowDevLogin: false
  }))
  assert.throws(() => validateEnvironmentConfig('production', {
    transport: 'http', apiBaseUrl: 'https://legacy.example/api', allowDevLogin: false
  }), /cloud transport/)
  assert.throws(() => validateEnvironmentConfig('production', {
    transport: 'cloud', cloudEnvId: '', cloudServiceName: 'mealpilot-api', allowDevLogin: false
  }), /cloudEnvId/)
})

test('cloud requests keep the cloud API receiver', async () => {
  const wx = cloudWx()
  wx.cloud.callContainer = function (options) {
    assert.equal(this, wx.cloud)
    setTimeout(() => options.success({ statusCode: 200, data: { ok: true, data: 1 } }), 0)
  }
  const client = createHttpClient({ transport: 'cloud', cloudEnvId: 'env', cloudServiceName: 'mealpilot-api', store: createStore(), wxApi: wx })
  assert.equal(await client.request('/recipes'), 1)
})

test('cloud reauthentication failure clears the session and reports expiration', async () => {
  const wx = cloudWx({ responses: [{ statusCode: 401, data: { ok: false } }] })
  const store = createStore('expired-token')
  let failures = 0
  const client = createHttpClient({
    transport: 'cloud', cloudEnvId: 'env', cloudServiceName: 'mealpilot-api', store, wxApi: wx,
    reauthenticate: async () => { throw new Error('login failed') },
    onAuthenticationFailure: () => { failures += 1 }
  })
  await assert.rejects(client.request('/recipes'), (error) => error.code === 'AUTH_SESSION_EXPIRED')
  assert.equal(store.getState().token, '')
  assert.equal(wx.calls.length, 1)
  assert.equal(failures, 1)
})

test('cloud retry stops after a second 401', async () => {
  const wx = cloudWx({ responses: [
    { statusCode: 401, data: { ok: false } },
    { statusCode: 401, data: { ok: false } }
  ] })
  const store = createStore('expired-token')
  let reauthCalls = 0
  const client = createHttpClient({
    transport: 'cloud', cloudEnvId: 'env', cloudServiceName: 'mealpilot-api', store, wxApi: wx,
    reauthenticate: async () => { reauthCalls += 1; store.setSession({ token: 'new-token' }) }
  })
  await assert.rejects(client.request('/recipes'), (error) => error.code === 'AUTH_SESSION_EXPIRED')
  assert.equal(wx.calls.length, 2)
  assert.equal(reauthCalls, 1)
})

test('HTTP transport uses localhost request and multipart upload', async () => {
  const calls = { request: [], upload: [] }
  const wx = {
    request(options) {
      calls.request.push(options)
      options.success({ statusCode: 200, data: { ok: true, data: { id: 1 } } })
    },
    uploadFile(options) {
      calls.upload.push(options)
      options.success({ statusCode: 201, data: JSON.stringify({ ok: true, data: { coverFileId: 'cloud://cover' } }) })
    }
  }
  const client = createHttpClient({ transport: 'http', baseUrl: 'http://127.0.0.1:3000/api', store: createStore(), wxApi: wx })
  assert.deepEqual(await client.request('/recipes'), { id: 1 })
  assert.deepEqual(await client.upload('/uploads/recipe-cover', '/tmp/cover.jpg'), { coverFileId: 'cloud://cover' })
  assert.equal(calls.request[0].url, 'http://127.0.0.1:3000/api/recipes')
  assert.equal(calls.upload[0].url, 'http://127.0.0.1:3000/api/uploads/recipe-cover')
  assert.equal(calls.upload[0].name, 'file')
  assert.equal(calls.upload[0].header.Authorization, 'Bearer jwt-token')
})

test('HTTP upload failure preserves WeChat errMsg', async () => {
  const wx = { uploadFile(options) { options.fail({ errMsg: 'uploadFile:fail domain unavailable', code: 'DOMAIN_ERROR' }) } }
  const client = createHttpClient({ baseUrl: 'http://127.0.0.1:3000/api', store: createStore(), wxApi: wx })
  await assert.rejects(client.upload('/uploads/avatar', '/tmp/avatar.jpg'), (error) => {
    assert.equal(error.message, 'uploadFile:fail domain unavailable')
    assert.equal(error.errMsg, error.message)
    assert.equal(error.code, 'DOMAIN_ERROR')
    return true
  })
})

test('HTTP request failure preserves WeChat errMsg', async () => {
  const wx = { request(options) { options.fail({ errMsg: 'request:fail timeout', code: 'TIMEOUT' }) } }
  const client = createHttpClient({ baseUrl: 'http://127.0.0.1:3000/api', store: createStore(), wxApi: wx })
  await assert.rejects(client.request('/recipes'), (error) => {
    assert.equal(error.message, 'request:fail timeout')
    assert.equal(error.errMsg, error.message)
    assert.equal(error.code, 'TIMEOUT')
    return true
  })
})

test('concurrent cloud 401 responses share one reauthentication', async () => {
  const attempts = {}
  const wx = cloudWx()
  wx.cloud.callContainer = (options) => {
    attempts[options.path] = (attempts[options.path] || 0) + 1
    const statusCode = attempts[options.path] === 1 ? 401 : 200
    setTimeout(() => options.success({
      statusCode,
      data: statusCode === 401 ? { ok: false } : { ok: true, data: { path: options.path } }
    }), 0)
  }
  const store = createStore('expired-token')
  let reauthCalls = 0
  const client = createHttpClient({
    transport: 'cloud', cloudEnvId: 'env', cloudServiceName: 'mealpilot-api', store, wxApi: wx,
    reauthenticate: async () => {
      reauthCalls += 1
      await new Promise((resolve) => setTimeout(resolve, 5))
      store.setSession({ token: 'new-token' })
    }
  })
  const results = await Promise.all([client.request('/recipes'), client.request('/auth/me')])
  assert.deepEqual(results, [{ path: '/api/recipes' }, { path: '/api/auth/me' }])
  assert.equal(reauthCalls, 1)
  assert.deepEqual(attempts, { '/api/recipes': 2, '/api/auth/me': 2 })
})

test('cloud upload failure preserves errMsg and does not commit', async () => {
  const wx = cloudWx({ responses: [{ statusCode: 200, data: { ok: true, data: { cloudPath: 'staging/families/10/recipes/id' } } }] })
  wx.cloud.uploadFile = options => options.fail({ errMsg: 'cloud.uploadFile:fail denied', code: 'STORAGE_DENIED' })
  const client = createHttpClient({ transport: 'cloud', cloudEnvId: 'env', cloudServiceName: 'mealpilot-api', store: createStore(), wxApi: wx })
  await assert.rejects(client.upload('/uploads/recipe-cover', '/tmp/cover.png'), error => {
    assert.equal(error.errMsg, 'cloud.uploadFile:fail denied')
    assert.equal(error.code, 'STORAGE_DENIED')
    return true
  })
  assert.deepEqual(wx.calls.map(call => call.path), ['/api/uploads/recipe-cover/prepare'])
})

function launchApp(transport, cloud) {
  const vm = require('node:vm')
  const fs = require('node:fs')
  const path = require('node:path')
  const code = fs.readFileSync(path.join(__dirname, '../../miniprogram/app.js'), 'utf8')
  let definition
  const warnings = []
  const context = {
    App(value) { definition = value },
    require(name) {
      assert.equal(name, './config')
      return { transport, cloudEnvId: 'cloud1-test' }
    },
    wx: { getStorageSync() { return 'saved-token' }, cloud },
    console: { error(...args) { warnings.push(args) }, warn(...args) { warnings.push(args) } }
  }
  vm.runInNewContext(code, context)
  definition.onLaunch()
  return { definition, warnings }
}

test('App initializes cloud only for cloud transport and keeps token when unavailable', () => {
  const initCalls = []
  const cloud = { init(options) { initCalls.push(options.env) } }
  const production = launchApp('cloud', cloud)
  assert.deepEqual(initCalls, ['cloud1-test'])
  assert.equal(production.definition.globalData.token, 'saved-token')
  launchApp('http', cloud)
  assert.deepEqual(initCalls, ['cloud1-test'])
  const unavailable = launchApp('cloud', undefined)
  assert.equal(unavailable.definition.globalData.token, 'saved-token')
  assert.equal(unavailable.warnings.length, 1)
  const failed = launchApp('cloud', { init() { throw new Error('init failed') } })
  assert.equal(failed.definition.globalData.token, 'saved-token')
  assert.equal(failed.warnings.length, 1)
})
