const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { router: uploadsRouter } = require('../src/routes/uploads')
const { HttpError } = require('../src/http')

async function withServer(app, run) {
  const server = await new Promise(resolve => { const instance = app.listen(0, () => resolve(instance)) })
  try { await run(`http://127.0.0.1:${server.address().port}`) }
  finally { await new Promise(resolve => server.close(resolve)) }
}

function harness({ bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]), failUpdate = false, maxBytes } = {}) {
  const jobs = new Map()
  const state = { uploads: [], downloads: [], deletes: [], user: { id: 7, openid: 'openid-7', display_name: 'User', avatar_url: '' } }
  const storage = {
    fileIdForPath: path => `cloud://test.bucket/${path}`,
    async downloadBuffer(fileId) { state.downloads.push(fileId); if (state.downloadError) throw state.downloadError; return bytes },
    async uploadBuffer(input) { state.uploads.push(input); return { fileId: `cloud://test.bucket/${input.cloudPath}` } },
    async getTemporaryUrl() { return 'https://temp.test/image' },
    async deleteFile(fileId) { state.deletes.push(fileId) }
  }
  const database = {
    async execute(sql, params = []) {
      if (/INSERT IGNORE INTO storage_cleanup_jobs/i.test(sql)) { jobs.set(params[0], { id: jobs.size + 1, kind: params[1] }); return [{ affectedRows: 1 }] }
      if (/SELECT .*FROM storage_cleanup_jobs/i.test(sql)) { const job = jobs.get(params[0]); return [job && job.kind === params[1] ? [job] : []] }
      if (/DELETE FROM storage_cleanup_jobs/i.test(sql)) { jobs.delete(params[0]); return [{ affectedRows: 1 }] }
      if (/^SELECT avatar_url FROM users/i.test(sql)) return [[{ avatar_url: state.user.avatar_url }]]
      if (/^UPDATE users SET avatar_url/i.test(sql)) {
        if (failUpdate) throw new Error('database unavailable')
        state.user.avatar_url = params[0]; return [{ affectedRows: 1 }]
      }
      if (/^SELECT id, openid/i.test(sql)) return [[state.user]]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
  const app = express()
  app.use(express.json())
  app.use('/api', uploadsRouter({ cloudStorageService: storage, database, storageFileIdPrefix: 'cloud://test.bucket', maxBytes,
    auth: (req, _res, next) => { req.user = state.user; next() },
    family: (req, _res, next) => { req.membership = { family_id: 10 }; next() }
  }))
  app.use((error, _req, res, _next) => res.status(error instanceof HttpError ? error.status : 500).json({ ok: false, message: error.message }))
  return { app, state, jobs }
}

async function post(base, path, data) {
  const response = await fetch(`${base}/api${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
  return { status: response.status, body: await response.json() }
}

test('avatar prepare owns a random staging path, and commit promotes validated bytes', async () => {
  const { app, state, jobs } = harness()
  await withServer(app, async base => {
    const prepared = await post(base, '/uploads/avatar/prepare', {})
    assert.equal(prepared.status, 200)
    const path = prepared.body.data.cloudPath
    assert.match(path, /^staging\/users\/7\/avatars\/[0-9a-f-]{36}$/)
    const fileId = `cloud://test.bucket/${path}`
    assert.equal(jobs.has(fileId), true)
    const committed = await post(base, '/uploads/avatar/commit', { fileId })
    assert.equal(committed.status, 201)
    assert.match(committed.body.data.user.avatarFileId, /^cloud:\/\/test\.bucket\/users\/7\/avatars\/[0-9a-f-]{36}\.jpg$/)
    assert.equal(committed.body.data.user.avatarUrl, 'https://temp.test/image')
    assert.equal(state.user.avatar_url, committed.body.data.user.avatarFileId)
    assert.deepEqual(state.uploads[0].buffer, Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
    assert.deepEqual(state.deletes, [fileId])
    assert.equal(jobs.has(fileId), false)
  })
})

test('recipe cover prepare uses current family and commit detects real format', async () => {
  const { app, state } = harness({ bytes: Buffer.from('RIFF0000WEBP') })
  await withServer(app, async base => {
    const prepared = await post(base, '/uploads/recipe-cover/prepare', {})
    assert.equal(prepared.status, 200)
    const path = prepared.body.data.cloudPath
    assert.match(path, /^staging\/families\/10\/recipes\/[0-9a-f-]{36}$/)
    const committed = await post(base, '/uploads/recipe-cover/commit', { fileId: `cloud://test.bucket/${path}` })
    assert.equal(committed.status, 201)
    assert.match(committed.body.data.coverFileId, /\.webp$/)
    assert.equal(committed.body.data.coverUrl, 'https://temp.test/image')
    assert.match(state.uploads[0].cloudPath, /^families\/10\/recipes\//)
  })
})

test('commit rejects another owner, unprepared IDs, malformed images, and files over 5 MB', async () => {
  const { app, state } = harness({ bytes: Buffer.from('not an image') })
  await withServer(app, async base => {
    const foreign = await post(base, '/uploads/avatar/commit', { fileId: 'cloud://test.bucket/staging/users/8/avatars/id' })
    assert.equal(foreign.status, 400)
    const unprepared = await post(base, '/uploads/avatar/commit', { fileId: 'cloud://test.bucket/staging/users/7/avatars/00000000-0000-4000-8000-000000000000' })
    assert.equal(unprepared.status, 400)
    const prepared = await post(base, '/uploads/avatar/prepare', {})
    const invalid = await post(base, '/uploads/avatar/commit', { fileId: `cloud://test.bucket/${prepared.body.data.cloudPath}` })
    assert.equal(invalid.status, 400)
    assert.equal(state.uploads.length, 0)
  })
  const tooLarge = harness({ bytes: Buffer.alloc(5 * 1024 * 1024 + 1) })
  await withServer(tooLarge.app, async base => {
    const prepared = await post(base, '/uploads/recipe-cover/prepare', {})
    const response = await post(base, '/uploads/recipe-cover/commit', { fileId: `cloud://test.bucket/${prepared.body.data.cloudPath}` })
    assert.equal(response.status, 413)
    assert.equal(tooLarge.state.uploads.length, 0)
  })
})

test('avatar database failure removes new final image while leaving staging cleanup queued', async () => {
  const { app, state, jobs } = harness({ failUpdate: true })
  await withServer(app, async base => {
    const prepared = await post(base, '/uploads/avatar/prepare', {})
    const fileId = `cloud://test.bucket/${prepared.body.data.cloudPath}`
    const response = await post(base, '/uploads/avatar/commit', { fileId })
    assert.equal(response.status, 500)
    assert.equal(state.deletes.length, 1)
    assert.match(state.deletes[0], /^cloud:\/\/test\.bucket\/users\/7\/avatars\//)
    assert.equal(jobs.has(fileId), true)
  })
})

test('oversized downloaded staging image maps to HTTP 413 in the actual error contract', async () => {
  const { app, state, jobs } = harness()
  // Simulate the storage size error returned after downloading the staged bytes.
  const { storageError } = require('../src/services/cloud-storage-service')
  state.downloadError = storageError('size')
  state.downloadError.status = 413
  await withServer(app, async base => {
    const prepared = await post(base, '/uploads/avatar/prepare', {})
    const fileId = `cloud://test.bucket/${prepared.body.data.cloudPath}`
    const response = await post(base, '/uploads/avatar/commit', { fileId })
    assert.equal(response.status, 413)
    assert.equal(jobs.has(fileId), true)
  })
})
