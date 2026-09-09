const test = require('node:test')
const assert = require('node:assert/strict')
const jwt = require('jsonwebtoken')

const { createToken, readToken } = require('../src/auth')

test('creates a signed token that preserves the user id', () => {
  const token = createToken({ id: 42, openid: 'openid-demo' }, 'test-secret')
  assert.deepEqual(readToken(token, 'test-secret'), { userId: 42, openid: 'openid-demo' })
})

test('JWT signs and verifies only with HS256 while preserving the seven-day expiry', () => {
  const token = createToken({ id: 42, openid: 'openid-demo' }, 'test-secret')
  const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'))
  const payload = jwt.decode(token)
  assert.equal(header.alg, 'HS256')
  assert.equal(payload.exp - payload.iat, 7 * 24 * 60 * 60)

  const wrongAlgorithmToken = jwt.sign({ userId: 42, openid: 'openid-demo' }, 'test-secret', { algorithm: 'HS384' })
  assert.throws(() => readToken(wrongAlgorithmToken, 'test-secret'))
})
