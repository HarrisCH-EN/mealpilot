const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
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

function createUploadApp({ maxBytes = 5 * 1024 * 1024 } = {}) {
  const calls = []
  const storage = {
    async uploadBuffer(input) {
      calls.push(input)
      return { fileId: 'cloud://test.bucket/families/10/recipes/test.jpg' }
    },
    async getTemporaryUrl() { return 'https://temp.test/cover' },
    async deleteFile() {}
  }
  const app = express()
  app.use(express.json({ limit: '1mb' }))
  app.use('/api', uploadsRouter({
    cloudStorageService: storage,
    maxBytes,
    auth: (request, _response, next) => { request.user = { id: 7 }; next() },
    family: (request, _response, next) => { request.membership = { family_id: 10 }; next() }
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, code: error.code || '', message: error.message }))
  return { app, calls }
}

test('octet-stream recipe cover upload keeps the existing response shape', async () => {
  const { app, calls } = createUploadApp()
  await withServer(app, async (baseUrl) => {
    const payload = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
    const response = await fetch(`${baseUrl}/api/uploads/recipe-cover`, {
      method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: payload
    })
    assert.equal(response.status, 201)
    assert.deepEqual((await response.json()).data, { coverFileId: 'cloud://test.bucket/families/10/recipes/test.jpg', coverUrl: 'https://temp.test/cover' })
    assert.deepEqual(calls[0].buffer, payload)
  })
})

test('octet-stream upload enforces the same size and magic-byte validation', async () => {
  const tooLarge = createUploadApp({ maxBytes: 4 })
  await withServer(tooLarge.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/uploads/recipe-cover`, {
      method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: Buffer.alloc(5)
    })
    assert.equal(response.status, 413)
  })

  const invalid = createUploadApp()
  await withServer(invalid.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/uploads/recipe-cover`, {
      method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: Buffer.from('not-an-image')
    })
    assert.equal(response.status, 400)
  })
})

test('octet-stream avatar upload returns user and stores server-scoped path', async () => {
  const database = {
    user: { id: 7, openid: 'openid', display_name: 'User', avatar_url: '' },
    async execute(sql, params) {
      if (/^SELECT avatar_url/i.test(sql)) return [[{ avatar_url: this.user.avatar_url }]]
      if (/^UPDATE users SET avatar_url/i.test(sql)) { this.user.avatar_url = params[0]; return [{ affectedRows: 1 }] }
      if (/^SELECT id, openid/i.test(sql)) return [[this.user]]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
  const uploads = []
  const storage = {
    async uploadBuffer(input) { uploads.push(input); return { fileId: 'cloud://test.bucket/users/7/avatars/new.png' } },
    async getTemporaryUrl() { return 'https://temp.test/avatar' },
    async deleteFile() {}
  }
  const app = express()
  app.use('/api', uploadsRouter({
    cloudStorageService: storage, database,
    auth: (request, _response, next) => { request.user = database.user; next() },
    family: (_request, _response, next) => next()
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, message: error.message }))
  await withServer(app, async (baseUrl) => {
    const payload = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const response = await fetch(`${baseUrl}/api/uploads/avatar`, {
      method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: payload
    })
    assert.equal(response.status, 201)
    const { user } = (await response.json()).data
    assert.equal(user.avatarFileId, 'cloud://test.bucket/users/7/avatars/new.png')
    assert.equal(user.avatarUrl, 'https://temp.test/avatar')
    assert.equal(uploads[0].cloudPath.startsWith('users/7/avatars/'), true)
    assert.equal(uploads[0].cloudPath.endsWith('.png'), true)
    assert.deepEqual(uploads[0].buffer, payload)
  })
})

test('octet-stream rejects payloads over the default 5MB limit', async () => {
  const { app, calls } = createUploadApp()
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/uploads/recipe-cover`, {
      method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: Buffer.alloc(5 * 1024 * 1024 + 1)
    })
    assert.equal(response.status, 413)
  })
  assert.equal(calls.length, 0)
})

test('octet-stream accepts WebP magic bytes regardless of client metadata', async () => {
  const { app, calls } = createUploadApp()
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/uploads/recipe-cover`, {
      method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-filename': 'fake.jpg' }, body: Buffer.from('RIFF0000WEBP')
    })
    assert.equal(response.status, 201)
  })
  assert.equal(calls[0].cloudPath.endsWith('.webp'), true)
})
