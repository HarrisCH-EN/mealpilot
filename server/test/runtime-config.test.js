const test = require('node:test')
const assert = require('node:assert/strict')

const { getConfig } = require('../src/config')
const { createToken, readToken } = require('../src/auth')
const { createRuntimeApp } = require('../src/server')

function withEnv(name, value, callback) {
  const previous = process.env[name]
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
  try {
    return callback()
  } finally {
    if (previous === undefined) delete process.env[name]
    else process.env[name] = previous
  }
}

function runtimeDatabase() {
  return {
    async execute(sql) {
      if (/INSERT INTO users/i.test(sql)) return [{ affectedRows: 1 }]
      if (/SELECT id, openid, display_name, avatar_url FROM users/i.test(sql)) {
        return [[{ id: 42, openid: 'runtime-user', display_name: '运行用户', avatar_url: '' }]]
      }
      if (/FROM family_members fm JOIN families f/i.test(sql)) return [[]]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
}

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

test('runtime app wiring uses the configured JWT secret for dev-login tokens', async () => {
  const { app } = createRuntimeApp({ jwtSecret: 'runtime-secret-a', devAuthEnabled: true, uploadRoot: 'runtime-uploads' }, runtimeDatabase())

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/dev-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ openid: 'runtime-user' })
    })
    assert.equal(response.status, 200)
    const { data } = await response.json()
    assert.deepEqual(readToken(data.token, 'runtime-secret-a'), { userId: 42, openid: 'runtime-user' })
    assert.throws(() => readToken(data.token, 'runtime-secret-b'))
  })
})

test('runtime app wiring disables dev-login when configured false', async () => {
  const { app } = createRuntimeApp({ jwtSecret: 'runtime-secret', devAuthEnabled: false, uploadRoot: 'runtime-uploads' }, {
    execute: async () => { throw new Error('disabled dev-login must not query the database') }
  })

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/dev-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ openid: 'runtime-user' })
    })
    assert.equal(response.status, 404)
  })
})

test('DEV_AUTH_ENABLED string parsing treats false as false and true as true', () => {
  withEnv('DEV_AUTH_ENABLED', 'false', () => assert.equal(getConfig().devAuthEnabled, false))
  withEnv('DEV_AUTH_ENABLED', 'true', () => assert.equal(getConfig().devAuthEnabled, true))
})

test('tokens signed with one secret cannot be verified with another secret', () => {
  const token = createToken({ id: 7, openid: 'secret-check' }, 'secret-a')
  assert.deepEqual(readToken(token, 'secret-a'), { userId: 7, openid: 'secret-check' })
  assert.throws(() => readToken(token, 'secret-b'))
})

test('production config rejects a missing or development JWT secret', () => {
  assert.throws(
    () => getConfig({ NODE_ENV: 'production', JWT_SECRET: '' }),
    /JWT_SECRET/
  )
  assert.throws(
    () => getConfig({ NODE_ENV: 'production', JWT_SECRET: 'local-development-secret-change-me' }),
    /JWT_SECRET/
  )
})

test('only exact production NODE_ENV activates production config rules', () => {
  const base = { JWT_SECRET: '', WECHAT_APP_ID: '', WECHAT_APP_SECRET: '' }
  assert.doesNotThrow(() => getConfig({ ...base, NODE_ENV: undefined }))
  assert.doesNotThrow(() => getConfig({ ...base, NODE_ENV: 'test' }))
  assert.equal(getConfig({ ...base, NODE_ENV: 'production', JWT_SECRET: 'explicit-production-secret' }).environment, 'production')
})
