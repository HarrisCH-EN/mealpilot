const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const { router: authFamilyRouter } = require('../src/routes/auth-family')
const { router: uploadsRouter } = require('../src/routes/uploads')

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

function makeProfileDatabase() {
  const user = { id: 7, openid: 'profile-user', display_name: '原来的名字', avatar_url: '' }
  const calls = []
  return {
    user,
    calls,
    async execute(sql, params) {
      calls.push({ sql, params })
      if (/UPDATE users SET display_name = \?/i.test(sql)) {
        user.display_name = params[0]
        return [{ affectedRows: 1 }]
      }
      if (/UPDATE users SET avatar_url = \?/i.test(sql)) {
        user.avatar_url = params[0]
        return [{ affectedRows: 1 }]
      }
      if (/SELECT id, openid, display_name, avatar_url FROM users WHERE id = \?/i.test(sql)) return [[user]]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
}

function makeAuthRouterApp(database) {
  const app = express()
  app.use(express.json())
  app.use('/api', authFamilyRouter({
    database,
    jwtSecret: 'profile-test-secret',
    devAuthEnabled: false,
    wechatAuthService: { exchangeCodeForSession: async () => ({ openid: 'unused' }) },
    auth: (request, _response, next) => { request.user = database.user; next() },
    family: (_request, _response, next) => next(),
    familyAdmin: (_request, _response, next) => next()
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, message: error.message }))
  return app
}

test('profile endpoint updates the authenticated display name and returns the fresh user', async () => {
  const database = makeProfileDatabase()
  await withServer(makeAuthRouterApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/profile`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: '新的名字' })
    })
    assert.equal(response.status, 200)
    assert.deepEqual((await response.json()).data.user, {
      id: 7,
      openid: 'profile-user',
      display_name: '新的名字',
      avatar_url: ''
    })
    assert.deepEqual(database.calls.find((call) => /UPDATE users SET display_name/i.test(call.sql)).params, ['新的名字', 7])
  })
})

test('avatar upload stores an authenticated user avatar without requiring a family', async () => {
  const database = makeProfileDatabase()
  const uploadRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mealpilot-avatar-'))
  try {
    const app = express()
    app.use('/api', uploadsRouter({
      uploadRoot,
      database,
      auth: (request, _response, next) => { request.user = database.user; next() },
      family: (_request, _response, next) => next()
    }))
    app.use((error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, message: error.message }))
    await withServer(app, async (baseUrl) => {
      const form = new FormData()
      form.append('file', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), 'avatar.jpg')
      const response = await fetch(`${baseUrl}/api/uploads/avatar`, { method: 'POST', body: form })
      assert.equal(response.status, 201)
      const data = (await response.json()).data
      assert.match(data.user.avatar_url, /^\/uploads\/avatars\/[a-f0-9-]+\.jpg$/)
      assert.equal(database.user.avatar_url, data.user.avatar_url)
      assert.equal(await fs.readFile(path.join(uploadRoot, data.user.avatar_url.replace(/^\/uploads\//, ''))).then(() => true), true)
    })
  } finally {
    await fs.rm(uploadRoot, { recursive: true, force: true })
  }
})
