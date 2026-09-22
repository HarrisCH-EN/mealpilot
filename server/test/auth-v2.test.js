const test = require('node:test')
const assert = require('node:assert/strict')
const { createAuthService } = require('../src/services/auth-service')
const { readToken } = require('../src/auth')
const { WechatAuthError } = require('../src/services/wechat-auth-service')

function makeDatabase(initialUser = null) {
  const users = initialUser ? [{ ...initialUser }] : []
  const calls = []
  return {
    users,
    calls,
    async execute(sql, params = []) {
      calls.push({ sql, params })
      if (/INSERT INTO users/i.test(sql)) {
        const openid = params[0]
        const existing = users.find((user) => user.openid === openid)
        if (!existing) users.push({ id: 7, openid, display_name: params[1], avatar_url: params[2] })
        return [{ insertId: existing ? existing.id : 7, affectedRows: existing ? 2 : 1 }]
      }
      if (/SELECT id, openid, display_name, avatar_url FROM users WHERE openid/i.test(sql)) {
        return [users.filter((user) => user.openid === params[0])]
      }
      if (/SELECT id, openid, display_name, avatar_url FROM users WHERE id/i.test(sql)) {
        return [users.filter((user) => user.id === params[0])]
      }
      if (/FROM family_members fm JOIN families/i.test(sql)) return [[]]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
}

test('Auth V2 login-or-register creates a new user and returns an authenticated incomplete session', async () => {
  const database = makeDatabase()
  const auth = createAuthService({
    database,
    jwtSecret: 'auth-v2-test-secret',
    wechatAuthService: { exchangeCodeForSession: async (code) => ({ openid: `openid-${code}` }) }
  })

  const result = await auth.loginOrRegister('fresh-code')

  assert.equal(result.isNewUser, true)
  assert.equal(result.profileComplete, false)
  assert.equal(result.membership, null)
  assert.equal(result.user.display_name, '微信用户')
  assert.deepEqual(readToken(result.token, 'auth-v2-test-secret'), { userId: 7 })
})

test('Auth V2 existing-user login preserves profile data and matches auth/me session semantics', async () => {
  const database = makeDatabase({ id: 9, openid: 'existing-openid', display_name: '原昵称', avatar_url: 'cloud://avatar/9.jpg' })
  const auth = createAuthService({
    database,
    jwtSecret: 'auth-v2-test-secret',
    wechatAuthService: { exchangeCodeForSession: async () => ({ openid: 'existing-openid' }) }
  })

  const login = await auth.loginOrRegister('existing-code')
  const restored = await auth.getSession({ userId: 9 })

  assert.equal(login.isNewUser, false)
  assert.equal(login.user.display_name, '原昵称')
  assert.equal(login.user.avatar_url, 'cloud://avatar/9.jpg')
  assert.deepEqual(
    { user: login.user, profileComplete: login.profileComplete, membership: login.membership },
    { user: restored.user, profileComplete: restored.profileComplete, membership: restored.membership }
  )
  assert.equal(database.users.length, 1)
  assert.equal(database.calls.filter(({ sql }) => /INSERT INTO users/i.test(sql)).length, 1)
})

test('Auth V2 provider errors expose a stable machine-readable auth code without provider details', async () => {
  const database = makeDatabase()
  const auth = createAuthService({
    database,
    jwtSecret: 'auth-v2-test-secret',
    wechatAuthService: { exchangeCodeForSession: async () => { throw new WechatAuthError('invalid-code', 'raw provider secret') } }
  })

  await assert.rejects(
    auth.loginOrRegister('bad-code'),
    (error) => error.status === 401 && error.code === 'AUTH_WECHAT_INVALID_CODE' && !/raw provider secret/i.test(error.message)
  )
})

test('Auth V2 maps provider outages to a safe 503 code', async () => {
  const database = makeDatabase()
  const auth = createAuthService({
    database,
    jwtSecret: 'auth-v2-test-secret',
    wechatAuthService: { exchangeCodeForSession: async () => { throw new WechatAuthError('unavailable', 'network secret') } }
  })

  await assert.rejects(
    auth.loginOrRegister('unavailable-code'),
    (error) => error.status === 503 && error.code === 'AUTH_WECHAT_UNAVAILABLE' && !/network secret/i.test(error.message)
  )
})
