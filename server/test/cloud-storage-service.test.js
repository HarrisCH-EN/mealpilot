const test = require('node:test')
const assert = require('node:assert/strict')

const { createCloudStorageService } = require('../src/services/cloud-storage-service')
const { createMediaUrlService } = require('../src/services/media-url-service')

function fakeSdk({ uploadFile, getTempFileURL, deleteFile, initError } = {}) {
  const calls = { init: [], upload: [], temp: [], delete: [] }
  const app = {
    async uploadFile(input) { calls.upload.push(input); return uploadFile ? uploadFile(input) : { fileID: 'cloud://uploaded' } },
    async getTempFileURL(input) { calls.temp.push(input); return getTempFileURL ? getTempFileURL(input) : { fileList: input.fileList.map((fileID) => ({ fileID, tempFileURL: `https://temp.test/${encodeURIComponent(fileID)}` })) } },
    async deleteFile(input) { calls.delete.push(input); return deleteFile ? deleteFile(input) : { fileList: input.fileList.map((fileID) => ({ fileID, code: 'SUCCESS' })) } }
  }
  return {
    calls,
    init(options) {
      calls.init.push(options)
      if (initError) throw initError
      return app
    }
  }
}

test('storage service uploads buffers, constructs stable IDs, and deletes through the SDK', async () => {
  const sdk = fakeSdk()
  const storage = createCloudStorageService({
    envId: 'env-test',
    fileIdPrefix: 'cloud://env-test.bucket',
    sdk
  })
  const buffer = Buffer.from('image')

  assert.equal(storage.fileIdForPath('families/7/recipes/a.jpg'), 'cloud://env-test.bucket/families/7/recipes/a.jpg')
  assert.deepEqual(await storage.uploadBuffer({ cloudPath: 'families/7/recipes/a.jpg', buffer }), { fileId: 'cloud://uploaded' })
  await storage.deleteFile('cloud://env-test.bucket/families/7/recipes/a.jpg')
  assert.deepEqual(sdk.calls.upload, [{ cloudPath: 'families/7/recipes/a.jpg', fileContent: buffer }])
  assert.deepEqual(sdk.calls.delete, [{ fileList: ['cloud://env-test.bucket/families/7/recipes/a.jpg'] }])
  assert.deepEqual(sdk.calls.init, [{ env: 'env-test' }])
})

test('storage service de-duplicates temporary URL requests and chunks at fifty IDs', async () => {
  const sdk = fakeSdk()
  const storage = createCloudStorageService({ envId: 'env-test', fileIdPrefix: 'cloud://env-test.bucket', sdk })
  const ids = Array.from({ length: 51 }, (_, index) => `cloud://env-test.bucket/users/${index}/avatar.jpg`)
  const result = await storage.getTemporaryUrls([ids[0], ids[0], '', '/assets/recipes/a.jpg', ...ids.slice(1)])

  assert.equal(Object.keys(result).length, 51)
  assert.deepEqual(sdk.calls.temp.map((call) => call.fileList.length), [50, 1])
  assert.equal(new Set(sdk.calls.temp.flatMap((call) => call.fileList)).size, 51)
  assert.equal(await storage.getTemporaryUrl(ids[0]), `https://temp.test/${encodeURIComponent(ids[0])}`)
})

test('storage service sanitizes SDK credential failures', async () => {
  const credential = 'fake-api-key-should-not-leak'
  const sdk = fakeSdk({ uploadFile: async () => { throw new Error(`unauthorized ${credential}`) } })
  const storage = createCloudStorageService({ envId: 'env-test', fileIdPrefix: 'cloud://env-test.bucket', sdk })

  await assert.rejects(
    () => storage.uploadBuffer({ cloudPath: 'users/7/avatars/a.jpg', buffer: Buffer.from('x') }),
    (error) => error.code === 'CLOUDBASE_STORAGE_AUTH_FAILED' && !error.message.includes(credential)
  )
})

test('storage fileIdForPath rejects missing or non-CloudBase prefixes', () => {
  for (const fileIdPrefix of ['', 'https://bucket.example']) {
    const storage = createCloudStorageService({ envId: 'env', fileIdPrefix })
    assert.throws(() => storage.fileIdForPath('system/recipes/a.jpg'), (error) => error.code === 'CLOUDBASE_STORAGE_PATH_FAILED')
  }
  const storage = createCloudStorageService({ envId: 'env', fileIdPrefix: 'cloud://env.bucket/' })
  assert.equal(storage.fileIdForPath('system/recipes/a.jpg'), 'cloud://env.bucket/system/recipes/a.jpg')
})

test('media URL service preserves legacy values and degrades one failed cloud URL', async () => {
  const storage = {
    async getTemporaryUrls(fileIds) {
      return Object.fromEntries(fileIds.filter((fileId) => fileId !== 'cloud://bad').map((fileId) => [fileId, `https://temp.test/${fileId.slice(8)}`]))
    }
  }
  const media = createMediaUrlService({ storage })
  const result = await media.resolveValues(['', 'https://already.test/a', '/assets/recipes/a.jpg', '/uploads/recipes/a.jpg', 'cloud://good', 'cloud://bad'])
  assert.deepEqual(result, ['', 'https://already.test/a', '/assets/recipes/a.jpg', '/uploads/recipes/a.jpg', 'https://temp.test/good', ''])
})

test('media URL service resolves stable values in nested response items without changing their shape', async () => {
  const media = createMediaUrlService({ storage: { async getTemporaryUrls(ids) { return Object.fromEntries(ids.map((id) => [id, 'https://temp.test/image'])) } } })
  const result = await media.resolveRecords([{ id: 1, coverUrl: 'cloud://cover' }], { stableField: 'coverFileId', displayField: 'coverUrl' })
  assert.deepEqual(result, [{ id: 1, coverFileId: 'cloud://cover', coverUrl: 'https://temp.test/image' }])
})

test('storage refuses oversized staged files before downloading their contents', async () => {
  const { createCloudStorageService } = require('../src/services/cloud-storage-service')
  let downloads = 0
  const sdk = { init() { return {
    uploadFile: async () => ({}), getTempFileURL: async () => ({}), deleteFile: async () => ({}),
    getFileInfo: async ({ fileList }) => ({ fileList: [{ fileID: fileList[0], code: 'SUCCESS', size: 5 * 1024 * 1024 + 1 }] }),
    downloadFile: async () => { downloads += 1; return { fileContent: Buffer.alloc(0) } }
  } } }
  const storage = createCloudStorageService({ envId: 'env', fileIdPrefix: 'cloud://env.bucket', sdk })
  await assert.rejects(storage.downloadBuffer('cloud://env.bucket/staging/users/7/avatars/id', 5 * 1024 * 1024), error => error.status === 413)
  assert.equal(downloads, 0)
})

test('storage downloads the uploaded staging file as a Buffer', async () => {
  const { createCloudStorageService } = require('../src/services/cloud-storage-service')
  const sdk = { init() { return {
    uploadFile: async () => ({ fileID: 'cloud://env.bucket/file' }),
    getTempFileURL: async () => ({ fileList: [] }),
    deleteFile: async () => ({ fileList: [] }),
    getFileInfo: async ({ fileList }) => ({ fileList: [{ fileID: fileList[0], code: 'SUCCESS', size: 4 }] }),
    downloadFile: async ({ fileID }) => {
      assert.equal(fileID, 'cloud://env.bucket/staging/users/7/avatars/id')
      return { fileContent: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) }
    }
  } } }
  const storage = createCloudStorageService({ envId: 'env', fileIdPrefix: 'cloud://env.bucket', sdk })
  assert.deepEqual(await storage.downloadBuffer('cloud://env.bucket/staging/users/7/avatars/id', 5 * 1024 * 1024), Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
})

test('storage surfaces a missing file from a per-file delete result', async () => {
  const sdk = fakeSdk({ deleteFile: async ({ fileList }) => ({ fileList: [{ fileID: fileList[0], code: 'FILE_NOT_FOUND' }] }) })
  const storage = createCloudStorageService({ envId: 'env-test', fileIdPrefix: 'cloud://env-test.bucket', sdk })
  await assert.rejects(storage.deleteFile('cloud://env-test.bucket/staging/users/7/avatars/id'), error => error.code === 'CLOUDBASE_STORAGE_NOT_FOUND_FAILED')
})
