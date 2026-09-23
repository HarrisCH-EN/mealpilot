const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { createAuthService } = require('../src/services/auth-service')
const { router: familyRouter } = require('../src/routes/families')
const { requireFamily, requireFamilyAdmin } = require('../src/middleware/authenticate')

function accountDatabase(role = 'member', { ownedActiveFamily = role === 'admin' } = {}) {
  const state = {
    users: [{ id: 7, openid: 'member-7', display_name: '成员', avatar_url: 'cloud://env/users/7/avatars/a.jpg' }],
    memberships: [
      { id: 70, family_id: 10, user_id: 7, role: role === 'owner' ? 'admin' : role, nickname: '成员', status: 'active' },
      ...(role === 'admin' ? [{ id: 71, family_id: 10, user_id: 8, role: 'member', nickname: '另一成员', status: 'active' }] : [])
    ],
    jobs: [], calls: [], committed: false, rolledBack: false
  }
  async function execute(sql, params = []) {
    state.calls.push({ sql, params })
    if (/SELECT id, avatar_url FROM users/i.test(sql)) return [[...state.users]]
    if (/SELECT id FROM families WHERE admin_user_id/i.test(sql)) return [ownedActiveFamily ? [{ id: 10 }] : []]
    if (/FROM family_members fm JOIN families f/i.test(sql)) {
      const membership = state.memberships.find((item) => item.user_id === params[0] && item.status === 'active')
      return [membership ? [{ member_id: membership.id, family_id: membership.family_id, role: membership.role, nickname: membership.nickname, family_name: '家', invite_code: 'ABC123' }] : []]
    }
    if (/SELECT id FROM family_members WHERE family_id/i.test(sql)) {
      return [state.memberships.filter((item) => item.family_id === params[0] && item.status === 'active' && item.user_id !== params[1]).map((item) => ({ id: item.id }))]
    }
    if (/UPDATE families SET status = 'archived'/i.test(sql)) return [{ affectedRows: 1 }]
    if (/INSERT IGNORE INTO storage_cleanup_jobs/i.test(sql)) { state.jobs.push(params[0]); return [{ affectedRows: 1 }] }
    if (/UPDATE family_members SET status = 'left', nickname = '已注销成员'/i.test(sql)) {
      state.memberships.filter((item) => item.user_id === params[0]).forEach((item) => Object.assign(item, { status: 'left', nickname: '已注销成员' }))
      return [{ affectedRows: 1 }]
    }
    if (/DELETE FROM users/i.test(sql)) {
      const before = state.users.length
      state.users = state.users.filter((item) => item.id !== params[0])
      state.memberships.filter((item) => item.user_id === params[0]).forEach((item) => { item.user_id = null })
      return [{ affectedRows: before - state.users.length }]
    }
    throw new Error(`Unexpected SQL: ${sql}`)
  }
  return {
    state,
    getConnection: async () => ({
      execute, beginTransaction: async () => {},
      commit: async () => { state.committed = true },
      rollback: async () => { state.rolledBack = true }, release() {}
    })
  }
}

test('ordinary member account deletion anonymizes history and deletes the login identity', async () => {
  const database = accountDatabase('member')
  const auth = createAuthService({ database, storageFileIdPrefix: 'cloud://env' })
  const result = await auth.deleteAccount({ userId: 7 })

  assert.deepEqual(result, { deleted: true })
  assert.equal(database.state.users.length, 0)
  assert.deepEqual(database.state.memberships[0], { id: 70, family_id: 10, user_id: null, role: 'member', nickname: '已注销成员', status: 'left' })
  assert.deepEqual(database.state.jobs, ['cloud://env/users/7/avatars/a.jpg'])
  assert.equal(database.state.calls.some(({ sql }) => /FROM family_members fm JOIN families f[\s\S]*FOR UPDATE/i.test(sql)), true)
  assert.equal(database.state.committed, true)
})

test('administrator with other members cannot delete the account', async () => {
  for (const role of ['admin']) {
    const database = accountDatabase(role)
    const auth = createAuthService({ database, storageFileIdPrefix: 'cloud://env' })
    await assert.rejects(auth.deleteAccount({ userId: 7 }), (error) => error.code === 'ACCOUNT_ADMIN_BLOCKED' && error.status === 409)
    assert.equal(database.state.users.length, 1)
    assert.equal(database.state.memberships[0].status, 'active')
    assert.equal(database.state.rolledBack, true)
  }
})

test('account deletion rejects an inconsistent administrator relation without orphaning the family', async () => {
  const database = accountDatabase('admin', { ownedActiveFamily: true })
  database.state.memberships = []
  const auth = createAuthService({ database, storageFileIdPrefix: 'cloud://env' })

  await assert.rejects(auth.deleteAccount({ userId: 7 }), (error) => error.status === 500 && /家庭管理员关系数据冲突/.test(error.message))
  assert.equal(database.state.users.length, 1)
  assert.equal(database.state.rolledBack, true)
})

function familyDatabase(actorRole = 'owner') {
  const now = new Date()
  const state = {
    families: [{ id: 10, name: '原来的家', invite_code: 'Old123', admin_user_id: actorRole === 'admin' ? 2 : 1, status: 'active', disbanded_at: null, purge_after: null }],
    memberships: [
      { id: 11, family_id: 10, user_id: 1, role: actorRole === 'admin' ? 'member' : 'admin', nickname: '管理员', status: 'active' },
      { id: 12, family_id: 10, user_id: 2, role: actorRole === 'admin' ? 'admin' : 'member', nickname: '成员', status: 'active' }
    ],
    committed: 0
  }
  function membershipRows(userId) {
    return state.memberships.filter((item) => item.user_id === userId && item.status === 'active').flatMap((item) => {
      const family = state.families.find((candidate) => candidate.id === item.family_id && candidate.status === 'active')
      return family ? [{ member_id: item.id, family_id: item.family_id, role: item.role, nickname: item.nickname, family_name: family.name, invite_code: family.invite_code }] : []
    })
  }
  async function execute(sql, params = []) {
    if (/SELECT id FROM users WHERE id/i.test(sql)) return [[{ id: params[0] }]]
    if (/FROM family_members fm JOIN families f/i.test(sql)) return [membershipRows(params[0])]
    if (/SELECT admin_user_id FROM families WHERE id = .*status = 'active'/i.test(sql)) {
      const family = state.families.find((item) => item.id === Number(params[0]))
      return [family ? [{ admin_user_id: family.admin_user_id }] : []]
    }
    if (/SELECT id, status FROM families WHERE id/i.test(sql)) {
      const family = state.families.find((item) => item.id === Number(params[0]))
      return [family ? [{ id: family.id, status: family.status }] : []]
    }
    if (/UPDATE families SET status = 'archived'/i.test(sql)) {
      const family = state.families.find((item) => item.id === Number(params[0]) && item.status === 'active')
      if (family) Object.assign(family, { status: 'archived', disbanded_at: now, purge_after: new Date(now.getTime() + 30 * 86400000) })
      return [{ affectedRows: family ? 1 : 0 }]
    }
    if (/UPDATE family_members SET status = 'left' WHERE family_id/i.test(sql)) {
      state.memberships.filter((item) => item.family_id === Number(params[0])).forEach((item) => { item.status = 'left' })
      return [{ affectedRows: 2 }]
    }
    if (/SELECT purge_after AS expiresAt/i.test(sql)) {
      const family = state.families.find((item) => item.id === Number(params[0]))
      return [[{ expiresAt: family.purge_after }]]
    }
    if (/SELECT id, name, disbanded_at AS disbandedAt/i.test(sql)) {
      return [state.families.filter((item) => item.admin_user_id === params[0] && item.status === 'archived').map((item) => ({ id: item.id, name: item.name, disbandedAt: item.disbanded_at, expiresAt: item.purge_after, createdAt: now, remainingDays: 30 }))]
    }
    if (/SELECT id, name, invite_code FROM families/i.test(sql)) {
      const family = state.families.find((item) => item.id === Number(params[0]) && item.admin_user_id === Number(params[1]) && item.status === 'archived')
      return [family ? [{ id: family.id, name: family.name, invite_code: family.invite_code }] : []]
    }
    if (/UPDATE families SET status = 'active'/i.test(sql)) {
      const family = state.families.find((item) => item.id === Number(params[1]) && item.status === 'archived')
      if (family) Object.assign(family, { status: 'active', invite_code: params[0], disbanded_at: null, purge_after: null })
      return [{ affectedRows: family ? 1 : 0 }]
    }
    if (/SELECT id FROM family_members WHERE family_id/i.test(sql)) {
      const member = state.memberships.find((item) => item.family_id === Number(params[0]) && item.user_id === Number(params[1]))
      return [member ? [{ id: member.id }] : []]
    }
    if (/UPDATE family_members SET status = 'left' WHERE family_id/i.test(sql)) {
      state.memberships.filter((item) => item.family_id === Number(params[0])).forEach((item) => { item.status = 'left' })
      return [{ affectedRows: 2 }]
    }
    if (/UPDATE family_members SET status = 'active', role = 'admin'/i.test(sql)) {
      const member = state.memberships.find((item) => item.id === Number(params[1]) && item.user_id === Number(params[2]))
      if (member) Object.assign(member, { status: 'active', role: 'admin', nickname: params[0] })
      return [{ affectedRows: member ? 1 : 0 }]
    }
    throw new Error(`Unexpected SQL: ${sql}`)
  }
  return { state, execute, getConnection: async () => ({ execute, beginTransaction: async () => {}, commit: async () => { state.committed += 1 }, rollback: async () => {}, release() {} }) }
}

async function withServer(app, callback) {
  const server = await new Promise((resolve) => { const instance = app.listen(0, () => resolve(instance)) })
  try { return await callback(`http://127.0.0.1:${server.address().port}`) } finally { await new Promise((resolve) => server.close(resolve)) }
}

function familyApp(database, actor) {
  const app = express()
  app.use(express.json())
  const auth = (request, _response, next) => { request.user = actor; next() }
  app.use('/api', familyRouter({ database, auth, family: requireFamily(database), familyAdmin: requireFamilyAdmin(database) }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ code: error.code, message: error.message }))
  return app
}

async function api(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { 'content-type': 'application/json' }, ...options })
  return { status: response.status, body: await response.json() }
}

test('the administrator archives a family, all members leave, and only that administrator restores it', async () => {
  const database = familyDatabase('admin')
  await withServer(familyApp(database, { id: 2, display_name: '管理员' }), async (baseUrl) => {
    const archived = await api(baseUrl, '/api/families/current', { method: 'DELETE' })
    assert.equal(archived.status, 200)
  })
  assert.equal(database.state.families[0].status, 'archived')
  assert.equal(database.state.memberships.every((item) => item.status === 'left'), true)

  await withServer(familyApp(database, { id: 2, display_name: '管理员' }), async (baseUrl) => {
    const recoverable = await api(baseUrl, '/api/families/recoverable')
    assert.equal(recoverable.body.data.length, 1)
    const restored = await api(baseUrl, '/api/families/10/restore', { method: 'POST' })
    assert.equal(restored.status, 200)
  })
  assert.equal(database.state.families[0].status, 'active')
  assert.equal(database.state.memberships.find((item) => item.user_id === 2).status, 'active')
  assert.equal(database.state.memberships.find((item) => item.user_id === 1).status, 'left')
  assert.notEqual(database.state.families[0].invite_code, 'Old123')
})
