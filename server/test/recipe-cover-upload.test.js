const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const express = require('express')

const { HttpError } = require('../src/http')
const { router } = require('../src/routes/uploads')

function makeApp(uploadRoot, { authenticated = true, hasFamily = true, maxBytes } = {}) {
  const app = express()
  app.use('/api', router({
    uploadRoot,
    maxBytes,
    auth: (_request, _response, next) => authenticated ? next() : next(new HttpError(401, '未登录')),
    family: (_request, _response, next) => hasFamily ? next() : next(new HttpError(403, '没有 active Family'))
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, message: error.message }))
  return app
}

async function withServer(app, callback) {
  const server = await new Promise((resolve) => { const instance = app.listen(0, () => resolve(instance)) })
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smart-meal-upload-'))
  try {
    for (const options of [{ authenticated: false }, { hasFamily: false }]) {
      await withServer(makeApp(root, options), async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/uploads/recipe-cover`, { method: 'POST', body: formFile(files.jpg, 'image/jpeg', 'dish.jpg') })
        assert.equal(response.status, options.authenticated === false ? 401 : 403)
      })
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('recipe cover upload accepts jpg png and webp, stores safe generated files, and returns a relative URL', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smart-meal-upload-'))
  try {
    await withServer(makeApp(root), async (baseUrl) => {
      for (const [extension, [mime, buffer]] of Object.entries({ jpg: ['image/jpeg', files.jpg], png: ['image/png', files.png], webp: ['image/webp', files.webp] })) {
        const response = await fetch(`${baseUrl}/api/uploads/recipe-cover`, { method: 'POST', body: formFile(buffer, mime, `用户文件../dish.${extension}`) })
        assert.equal(response.status, 201)
        const data = (await response.json()).data
        assert.match(data.coverUrl, new RegExp(`^/uploads/recipes/[a-f0-9-]+\\.${extension}$`))
        assert.equal(data.coverUrl.startsWith('/uploads/recipes/'), true)
        assert.equal(/^[a-zA-Z]:[\\/]/.test(data.coverUrl), false)
        assert.equal(await fs.readFile(path.join(root, data.coverUrl.replace(/^\/uploads\//, ''))).then(() => true), true)
      }
    })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('recipe cover upload rejects invalid extension, MIME, missing file, and oversized content', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smart-meal-upload-'))
  try {
    await withServer(makeApp(root, { maxBytes: 10 }), async (baseUrl) => {
      const cases = [
        formFile(files.jpg, 'image/jpeg', 'dish.exe'),
        formFile(files.jpg, 'application/octet-stream', 'dish.jpg'),
        formFile(Buffer.alloc(11, 1), 'image/jpeg', 'dish.jpg'),
        new FormData()
      ]
      for (const form of cases) {
        const response = await fetch(`${baseUrl}/api/uploads/recipe-cover`, { method: 'POST', body: form })
        assert.ok([400, 413].includes(response.status))
      }
      const entries = await fs.readdir(root, { withFileTypes: true })
      assert.equal(entries.length, 0)
    })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
