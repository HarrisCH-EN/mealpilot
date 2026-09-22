const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')

const { HttpError } = require('../src/http')
const { router } = require('../src/routes/uploads')

function makeStorage() {
  const calls = { uploads: [], deletes: [], urls: [] }
  return {
    calls,
    fileIdForPath: (cloudPath) => `cloud://test.bucket/${cloudPath}`,
    async uploadBuffer(input) { calls.uploads.push(input); return { fileId: `cloud://test.bucket/${input.cloudPath}` } },
    async getTemporaryUrl(fileId) { calls.urls.push(fileId); return `https://temp.test/${encodeURIComponent(fileId)}` },
    async deleteFile(fileId) { calls.deletes.push(fileId) }
  }
}

function makeApp({ authenticated = true, hasFamily = true, maxBytes } = {}) {
  const storage = makeStorage()
  const database = { async execute() { return [[{ id: 7, openid: 'user', display_name: '用户', avatar_url: '' }]] } }
  const app = express()
  app.use('/api', router({
    cloudStorageService: storage,
    database,
    maxBytes,
    auth: (request, _response, next) => authenticated ? (request.user = { id: 7 }, next()) : next(new HttpError(401, '未登录')),
    family: (request, _response, next) => hasFamily ? (request.membership = { family_id: 9 }, next()) : next(new HttpError(403, '没有 active Family'))
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, message: error.message }))
  return { app, storage }
}

async function withServer(app, callback) {
  const server = await new Promise((resolve) => { const instance = app.listen(0, () => resolve(instance)) })
  try { return await callback(`http://127.0.0.1:${server.address().port}`) } finally { await new Promise((resolve) => server.close(resolve)) }
}

function formFile(buffer, mime, filename) {
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: mime }), filename)
  return form
}

const files = {
  jpg: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  webp: Buffer.from('RIFFxxxxWEBP')
}

test('recipe cover upload requires authentication and an active Family', async () => {
  for (const options of [{ authenticated: false }, { hasFamily: false }]) {
    const { app } = makeApp(options)
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/uploads/recipe-cover`, { method: 'POST', body: formFile(files.jpg, 'image/jpeg', 'dish.jpg') })
      assert.equal(response.status, options.authenticated === false ? 401 : 403)
    })
  }
})

test('recipe cover upload accepts jpg png and webp and returns stable and display values without local writes', async () => {
  const { app, storage } = makeApp()
  await withServer(app, async (baseUrl) => {
    for (const [extension, [mime, buffer]] of Object.entries({ jpg: ['image/jpeg', files.jpg], png: ['image/png', files.png], webp: ['image/webp', files.webp] })) {
      const response = await fetch(`${baseUrl}/api/uploads/recipe-cover`, { method: 'POST', body: formFile(buffer, mime, `用户文件../dish.${extension}`) })
      assert.equal(response.status, 201)
      const data = (await response.json()).data
      assert.match(data.coverFileId, new RegExp(`^cloud://test\\.bucket/families/9/recipes/[a-f0-9-]+\\.${extension}$`))
      assert.match(data.coverUrl, /^https:\/\/temp\.test\//)
    }
  })
  assert.equal(storage.calls.uploads.length, 3)
  assert.equal(storage.calls.uploads.every(({ buffer }) => Buffer.isBuffer(buffer)), true)
})

test('recipe cover upload trusts detected bytes over extension and MIME, while rejecting invalid and oversized content', async () => {
  const { app, storage } = makeApp({ maxBytes: 10 })
  await withServer(app, async (baseUrl) => {
    const cases = [
      formFile(Buffer.alloc(11, 1), 'image/jpeg', 'dish.jpg'),
      formFile(Buffer.from('nope'), 'image/jpeg', 'dish.jpg'),
      new FormData()
    ]
    for (const form of cases) {
      const response = await fetch(`${baseUrl}/api/uploads/recipe-cover`, { method: 'POST', body: form })
      assert.ok([400, 413].includes(response.status))
    }
  })
  assert.equal(storage.calls.uploads.length, 0)

  const { app: mismatchApp, storage: mismatchStorage } = makeApp()
  await withServer(mismatchApp, async (baseUrl) => {
    for (const [mime, filename] of [['application/octet-stream', 'dish.jpg'], ['image/jpeg', 'dish.exe']]) {
      const response = await fetch(`${baseUrl}/api/uploads/recipe-cover`, { method: 'POST', body: formFile(files.jpg, mime, filename) })
      assert.equal(response.status, 201)
    }
  })
  assert.equal(mismatchStorage.calls.uploads.length, 2)
})
