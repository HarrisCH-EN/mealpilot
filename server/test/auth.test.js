const test = require('node:test')
const assert = require('node:assert/strict')

const { createToken, readToken } = require('../src/auth')

test('creates a signed token that preserves the user id', () => {
  const token = createToken({ id: 42, openid: 'openid-demo' }, 'test-secret')
  assert.deepEqual(readToken(token, 'test-secret'), { userId: 42, openid: 'openid-demo' })
})
