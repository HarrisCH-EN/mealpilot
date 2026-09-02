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
    assert.deepEqual(await response.json(), { ok: true, data: { service: 'smart-meal-api' } })
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
