const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')

const { router: authFamilyRouter } = require('../src/routes/auth-family')
const { router: uploadsRouter, deleteOldAvatar } = require('../src/routes/uploads')

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

function makeProfileDatabase({ failAvatarUpdate = false } = {}) {
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
        if (failAvatarUpdate) throw new Error('database update failed')
        user.avatar_url = params[0]
        return [{ affectedRows: 1 }]
      }
      if (/SELECT avatar_url FROM users WHERE id = \?/i.test(sql)) return [[{ avatar_url: user.avatar_url }]]
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
      avatar_url: '',
      avatarFileId: '',
      avatarUrl: ''
    })
    assert.deepEqual(database.calls.find((call) => /UPDATE users SET display_name/i.test(call.sql)).params, ['新的名字', 7])
  })
})

test('current family members expose stable avatarFileId and temporary avatarUrl', async () => {
  const database = {
    async execute(sql) {
      if (/SELECT fm\.id, fm\.user_id AS userId/i.test(sql)) return [[{
        id: 3,
        userId: 8,
        role: 'member',
        nickname: '家庭成员',
        displayName: '成员',
        avatarUrl: 'cloud://test.bucket/users/8/avatars/member.jpg'
      }]]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
  const mediaUrlService = {
    async resolveValues(values) { return values.map((value) => value ? 'https://temp.test/member-avatar' : '') }
  }
  const app = express()
  app.use('/api', authFamilyRouter({
    database,
    jwtSecret: 'profile-test-secret',
    devAuthEnabled: false,
    wechatAuthService: { exchangeCodeForSession: async () => ({ openid: 'unused' }) },
    auth: (request, _response, next) => { request.user = { id: 7 }; next() },
    family: (request, _response, next) => { request.membership = { family_id: 10, invite_code: 'SECRET', name: '家庭' }; next() },
    familyAdmin: (_request, _response, next) => next(),
    mediaUrlService
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, message: error.message }))
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/families/current`)
    assert.equal(response.status, 200)
    assert.deepEqual((await response.json()).data.members, [{
      id: 3,
      userId: 8,
      role: 'member',
      nickname: '家庭成员',
      displayName: '成员',
      avatarUrl: 'https://temp.test/member-avatar',
      avatarFileId: 'cloud://test.bucket/users/8/avatars/member.jpg'
    }])
  })
})

test('avatar upload stores a stable CloudBase file ID and returns a temporary display URL', async () => {
  const database = makeProfileDatabase()
  const storage = {
    calls: { uploads: [], urls: [], deletes: [] },
    async uploadBuffer(input) { this.calls.uploads.push(input); return { fileId: `cloud://test.bucket/users/7/avatars/${input.cloudPath.split('/').pop()}` } },
    async getTemporaryUrl(fileId) { this.calls.urls.push(fileId); return 'https://temp.test/avatar' },
    async deleteFile(fileId) { this.calls.deletes.push(fileId) }
  }
  const app = express()
  app.use('/api', uploadsRouter({
    cloudStorageService: storage,
    database,
    auth: (request, _response, next) => { request.user = database.user; next() },
    family: (_request, _response, next) => next(),
    storageFileIdPrefix: 'cloud://test.bucket'
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, message: error.message }))
  await withServer(app, async (baseUrl) => {
    const form = new FormData()
    form.append('file', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), 'avatar.jpg')
    const response = await fetch(`${baseUrl}/api/uploads/avatar`, { method: 'POST', body: form })
    assert.equal(response.status, 201)
    const data = (await response.json()).data
    assert.equal(data.user.avatar_url, 'https://temp.test/avatar')
    assert.equal(data.user.avatarUrl, 'https://temp.test/avatar')
    assert.match(data.user.avatarFileId, /^cloud:\/\/test\.bucket\/users\/7\/avatars\/[a-f0-9-]+\.jpg$/)
    assert.equal(database.user.avatar_url, data.user.avatarFileId)
    assert.equal(storage.calls.uploads[0].cloudPath.startsWith('users/7/avatars/'), true)
  })
})

test('avatar update deletes old scoped CloudBase avatar only after the DB update succeeds', async () => {
  const database = makeProfileDatabase()
  database.user.avatar_url = 'cloud://test.bucket/users/7/avatars/old.jpg'
  const storage = {
    async uploadBuffer() { return { fileId: 'cloud://test.bucket/users/7/avatars/new.jpg' } },
    async getTemporaryUrl() { return 'https://temp.test/new-avatar' },
    deletes: [],
    async deleteFile(fileId) { this.deletes.push(fileId) }
  }
  const app = express()
  app.use('/api', uploadsRouter({ cloudStorageService: storage, database, storageFileIdPrefix: 'cloud://test.bucket', auth: (request, _response, next) => { request.user = database.user; next() }, family: (_request, _response, next) => next() }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, message: error.message }))
  await withServer(app, async (baseUrl) => {
    const form = new FormData()
    form.append('file', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), 'avatar.jpg')
    const response = await fetch(`${baseUrl}/api/uploads/avatar`, { method: 'POST', body: form })
    assert.equal(response.status, 201)
  })
  assert.deepEqual(storage.deletes, ['cloud://test.bucket/users/7/avatars/old.jpg'])
})

test('avatar upload deletes the new CloudBase object when the DB update fails', async () => {
  const database = makeProfileDatabase({ failAvatarUpdate: true })
  const storage = {
    deletes: [],
    async uploadBuffer() { return { fileId: 'cloud://test.bucket/users/7/avatars/new.jpg' } },
    async getTemporaryUrl() { return 'https://temp.test/new-avatar' },
    async deleteFile(fileId) { this.deletes.push(fileId) }
  }
  const app = express()
  app.use('/api', uploadsRouter({ cloudStorageService: storage, database, storageFileIdPrefix: 'cloud://test.bucket', auth: (request, _response, next) => { request.user = database.user; next() }, family: (_request, _response, next) => next() }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, message: error.message }))
  await withServer(app, async (baseUrl) => {
    const form = new FormData()
    form.append('file', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), 'avatar.jpg')
    const response = await fetch(`${baseUrl}/api/uploads/avatar`, { method: 'POST', body: form })
    assert.equal(response.status, 500)
  })
  assert.deepEqual(storage.deletes, ['cloud://test.bucket/users/7/avatars/new.jpg'])
})

test('avatar upload succeeds when cleanup of the old CloudBase object fails', async () => {
  const database = makeProfileDatabase()
  database.user.avatar_url = 'cloud://test.bucket/users/7/avatars/old.jpg'
  const storage = {
    async uploadBuffer() { return { fileId: 'cloud://test.bucket/users/7/avatars/new.jpg' } },
    async getTemporaryUrl() { return 'https://temp.test/new-avatar' },
    async deleteFile() { throw new Error('old object deletion failed') }
  }
  const app = express()
  app.use('/api', uploadsRouter({ cloudStorageService: storage, database, storageFileIdPrefix: 'cloud://test.bucket', auth: (request, _response, next) => { request.user = database.user; next() }, family: (_request, _response, next) => next() }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, message: error.message }))
  await withServer(app, async (baseUrl) => {
    const form = new FormData()
    form.append('file', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), 'avatar.jpg')
    const response = await fetch(`${baseUrl}/api/uploads/avatar`, { method: 'POST', body: form })
    assert.equal(response.status, 201)
  })
})

test('avatar cleanup never deletes another user, system, or legacy object', async () => {
  const deleted = []
  const storage = { async deleteFile(fileId) { deleted.push(fileId) } }
  for (const fileId of [
    'cloud://test.bucket/users/8/avatars/other.jpg',
    'cloud://test.bucket/system/avatars/default.jpg',
    '/uploads/avatar/old.jpg',
    'cloud://test.bucket/users/7/avatars/nested/old.jpg'
  ]) await deleteOldAvatar(storage, fileId, 'cloud://test.bucket', 7)
  assert.deepEqual(deleted, [])
})
