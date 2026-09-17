const test = require('node:test')
const assert = require('node:assert/strict')
const { createApp } = require('../src/app')
const { getConfig } = require('../src/config')
const { createCloudStorageService } = require('../src/services/cloud-storage-service')

async function request(app) {
  const server = await new Promise((resolve) => { const instance = app.listen(0, () => resolve(instance)) })
  try {
    return await fetch(`http://127.0.0.1:${server.address().port}/api/health/storage`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('config reads CloudBase probe settings without requiring an API key', () => {
  const config = getConfig({
    NODE_ENV: 'test',
    JWT_SECRET: '',
    CLOUDBASE_ENV_ID: 'env-test',
    CLOUDBASE_STORAGE_PROBE_FILE_ID: 'cloud://test/image.jpg'
  })
  assert.equal(config.cloudbaseEnvId, 'env-test')
  assert.equal(config.cloudbaseStorageProbeFileId, 'cloud://test/image.jpg')
})

test('storage probe reports bytes read by its injected service', async () => {
  const response = await request(createApp({ database: null, cloudStorageService: { readProbe: async () => 123 } }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, data: { storage: 'cloudbase', readable: true, bytes: 123 } })
})

test('storage probe sends service failures through the common error middleware', async () => {
  const original = console.error
  const logs = []
  console.error = (...args) => logs.push(args)
  try {
    const response = await request(createApp({ database: null, cloudStorageService: { readProbe: async () => { throw Object.assign(new Error('storage download failed'), { code: 'CLOUDBASE_STORAGE_DOWNLOAD_FAILED' }) } } }))
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { ok: false, message: '服务器发生错误' })
    assert.equal(logs.length, 1)
    assert.equal(logs[0][1].code, 'CLOUDBASE_STORAGE_DOWNLOAD_FAILED')
    assert.doesNotMatch(JSON.stringify(logs), /credential|secret-value|token/i)
  } finally {
    console.error = original
  }
})

test('storage service downloads configured file and counts Buffer bytes', async () => {
  let received
  const sdk = { init(options) { received = options; return { downloadFile: async (input) => { received.fileID = input.fileID; return { fileContent: Buffer.from('image') } } } } }
  const service = createCloudStorageService({ envId: 'env-test', probeFileId: 'cloud://test/image.jpg', sdk })
  assert.equal(await service.readProbe(), 5)
  assert.deepEqual(received, { env: 'env-test', fileID: 'cloud://test/image.jpg' })
})

test('storage service turns SDK errors into safe stage codes', async () => {
  const sdk = { init: () => ({ downloadFile: async () => { throw new Error('credential secret-value') } }) }
  const service = createCloudStorageService({ envId: 'env-test', probeFileId: 'cloud://test/image.jpg', sdk })
  await assert.rejects(service.readProbe(), (error) => {
    assert.equal(error.code, 'CLOUDBASE_STORAGE_AUTH_FAILED')
    assert.doesNotMatch(error.message, /secret-value/)
    return true
  })
})
