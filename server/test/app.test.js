const test = require('node:test')
const assert = require('node:assert/strict')

const { createApp } = require('../src/app')

test('health endpoint reports that the API is running', async () => {
  const app = createApp({ database: null })
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance))
  })

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true, data: { service: 'mealpilot-api' } })
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('local runtime serves legacy upload paths for avatars and recipe covers', async () => {
  const app = createApp({ database: null, serveLocalUploads: true })
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance))
  })

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/uploads/avatars/b7e0a78f-0b07-4dee-9545-91a311b7b1f2.jpg`)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') || '', /^image\/jpeg/)
    assert.ok((await response.arrayBuffer()).byteLength > 1000)

    const cover = await fetch(`http://127.0.0.1:${server.address().port}/uploads/recipes/e52bd0a0-dd7e-45df-988b-052326f0b9a9.jpg`)
    assert.equal(cover.status, 200)
    assert.match(cover.headers.get('content-type') || '', /^image\/jpeg/)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
