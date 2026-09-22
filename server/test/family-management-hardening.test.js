const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { requireFamily } = require('../src/middleware/authenticate')
const { router } = require('../src/routes/families')
const { ensureFamilyManagementSchema } = require('../src/scripts/family-management-schema')

const family = { id: 10, name: '家庭 A', invite_code: 'aB3xY9', owner_user_id: 1 }
const owner = { id: 1, openid: 'owner', display_name: '创建者', avatar_url: null }
const admin = { id: 2, openid: 'admin', display_name: '管理员', avatar_url: null }
const member = { id: 3, openid: 'member', display_name: '成员', avatar_url: null }

function makeDatabase({ memberships = [], families = [family], users = [owner, admin, member], duplicateFamilyInsert = false, duplicateInviteRefresh = false } = {}) {
  const state = {
    families: families.map((item) => ({ ...item })),
    users: users.map((item) => ({ ...item })),
    memberships: memberships.map((item, index) => ({
      id: item.id || index + 1,
      family_id: item.family_id || item.family.id,
      user_id: item.user_id,
      role: item.role || 'member',
      nickname: item.nickname || '家庭成员',
      status: item.status || 'active'
    })),
    nextFamilyId: 100,
    nextMemberId: 200,
    familyInsertAttempts: 0,
    inviteRefreshAttempts: 0,
    committed: false
  }

  function rowsForUser(userId) {
    return state.memberships
      .filter((item) => item.user_id === userId && item.status === 'active')
      .map((item) => {
        const currentFamily = state.families.find((candidate) => candidate.id === item.family_id)
        return {
          member_id: item.id,
          family_id: item.family_id,
          role: item.role,
          nickname: item.nickname,
          family_name: currentFamily.name,
          invite_code: currentFamily.invite_code
        }
      })
  }

  async function execute(sql, params = []) {
    if (/SELECT id FROM users WHERE id = \? FOR UPDATE/i.test(sql)) return [[{ id: params[0] }]]
    if (/FROM family_members fm JOIN families f/i.test(sql)) return [rowsForUser(params[0])]
    if (/SELECT fm\.id, fm\.user_id AS userId/i.test(sql)) {
      const currentFamily = state.families.find((item) => item.id === params[0])
      return [state.memberships
        .filter((item) => item.family_id === currentFamily.id && item.status === 'active')
        .map((item) => {
          const user = state.users.find((candidate) => candidate.id === item.user_id) || {}
          return { id: item.id, userId: item.user_id, role: item.role, nickname: item.nickname, displayName: user.display_name, avatarUrl: user.avatar_url }
        })]
    }
    if (/SELECT id, status FROM family_members WHERE family_id = \? AND user_id = \? FOR UPDATE/i.test(sql)) {
      const found = state.memberships.find((item) => item.family_id === params[0] && item.user_id === params[1])
      return [found ? [{ id: found.id, status: found.status }] : []]
    }
    if (/SELECT id, user_id, role, status FROM family_members WHERE id = \? AND family_id = \?/i.test(sql)) {
      const found = state.memberships.find((item) => item.id === Number(params[0]) && item.family_id === Number(params[1]) && item.status === 'active')
      return [found ? [{ id: found.id, user_id: found.user_id, role: found.role, status: found.status }] : []]
    }
    if (/SELECT id, invite_code FROM families WHERE id = \? FOR UPDATE/i.test(sql)) {
      const found = state.families.find((item) => item.id === Number(params[0]))
      return [found ? [{ id: found.id, invite_code: found.invite_code }] : []]
    }
    if (/SELECT id FROM families WHERE invite_code =/i.test(sql)) {
      const found = state.families.find((item) => item.invite_code === params[0])
      return [found ? [{ id: found.id }] : []]
    }
    if (/INSERT INTO families/i.test(sql)) {
      state.familyInsertAttempts += 1
      if (duplicateFamilyInsert && state.familyInsertAttempts === 1) {
        const error = new Error('duplicate invite code')
        error.code = 'ER_DUP_ENTRY'
        throw error
      }
      const [name, inviteCode, ownerUserId] = params
      const created = { id: state.nextFamilyId++, name, invite_code: inviteCode, owner_user_id: ownerUserId }
      state.families.push(created)
      return [{ insertId: created.id }]
    }
    if (/INSERT INTO family_members/i.test(sql)) {
      const [familyId, userId, nickname] = params
      state.memberships.push({ id: state.nextMemberId++, family_id: familyId, user_id: userId, role: /'owner'/i.test(sql) ? 'owner' : 'member', nickname, status: 'active' })
      return [{ affectedRows: 1 }]
    }
    if (/UPDATE family_members SET status = 'active'/i.test(sql)) {
      const [nickname, memberId] = params
      const found = state.memberships.find((item) => item.id === Number(memberId))
      if (found) Object.assign(found, { nickname, role: 'member', status: 'active' })
      return [{ affectedRows: found ? 1 : 0 }]
    }
    if (/UPDATE family_members SET status = 'left'/i.test(sql)) {
      const found = state.memberships.find((item) => item.id === Number(params[0]) && item.status === 'active')
      if (found) found.status = 'left'
      return [{ affectedRows: found ? 1 : 0 }]
    }
    if (/UPDATE families SET owner_user_id =/i.test(sql)) {
      const [ownerUserId, familyId] = params
      const currentFamily = state.families.find((item) => item.id === Number(familyId))
      if (!currentFamily || currentFamily.owner_user_id !== Number(params[2])) return [{ affectedRows: 0 }]
      currentFamily.owner_user_id = Number(ownerUserId)
      return [{ affectedRows: 1 }]
    }
    if (/UPDATE families SET invite_code =/i.test(sql)) {
      state.inviteRefreshAttempts += 1
      if (duplicateInviteRefresh && state.inviteRefreshAttempts === 1) {
        const error = new Error('duplicate invite code')
        error.code = 'ER_DUP_ENTRY'
        throw error
      }
      const [inviteCode, familyId] = params
      const currentFamily = state.families.find((item) => item.id === Number(familyId))
      if (currentFamily) currentFamily.invite_code = inviteCode
      return [{ affectedRows: currentFamily ? 1 : 0 }]
    }
    if (/UPDATE family_members SET role = 'member'/i.test(sql)) {
      const found = state.memberships.find((item) => item.id === Number(params[0]) && item.status === 'active')
      if (found) found.role = 'member'
      return [{ affectedRows: found ? 1 : 0 }]
    }
    if (/UPDATE family_members SET role = 'owner'/i.test(sql)) {
      const found = state.memberships.find((item) => item.id === Number(params[0]) && item.status === 'active')
      if (found) found.role = 'owner'
      return [{ affectedRows: found ? 1 : 0 }]
    }
    if (/UPDATE family_members SET role = \?/i.test(sql)) {
      const [role, memberId] = params
      const found = state.memberships.find((item) => item.id === Number(memberId) && item.status === 'active')
      if (found) found.role = role
      return [{ affectedRows: found ? 1 : 0 }]
    }
    if (/SELECT id, name, invite_code, owner_user_id FROM families/i.test(sql)) {
      return [state.families.filter((item) => item.id === Number(params[0]))]
    }
    throw new Error(`Unexpected SQL: ${sql}`)
  }

  return {
    state,
    execute,
    getConnection: async () => ({
      beginTransaction: async () => {},
      commit: async () => { state.committed = true },
      rollback: async () => {},
      release: () => {},
      execute
    })
  }
}

function makeApp(database, actor, seedStarterRecipes = async () => {}) {
  const app = express()
  app.use(express.json())
  app.use('/api', router({
    database,
    jwtSecret: 'test-secret',
    devAuthEnabled: false,
    auth: (request, _response, next) => { request.user = actor; next() },
    family: requireFamily(database),
    seedStarterRecipes
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ message: error.message }))
  return app
}

async function withServer(app, callback) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance))
  })
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

async function call(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...options
  })
  const text = await response.text()
  let body = {}
  try { body = text ? JSON.parse(text) : {} } catch (_error) { body = { raw: text } }
  return { response, body }
}

test('every active member can read the invite code without leaking it from current-family data', async () => {
  const database = makeDatabase({ memberships: [{ id: 11, family, user_id: member.id, role: 'member' }] })
  await withServer(makeApp(database, member), async (baseUrl) => {
    const current = await call(baseUrl, '/api/families/current')
    assert.equal(current.response.status, 200)
    assert.equal(Object.prototype.hasOwnProperty.call(current.body.data, 'invite_code'), false)

    const invite = await call(baseUrl, '/api/families/current/invite-code')
    assert.equal(invite.response.status, 200)
    assert.equal(invite.body.data.inviteCode, family.invite_code)
  })
})

test('admins can refresh the invite code, immediately invalidating the old code', async () => {
  for (const actor of [owner, admin]) {
    const database = makeDatabase({ memberships: [{ id: actor.id + 10, family, user_id: actor.id, role: actor === owner ? 'owner' : 'admin' }] })
    const oldCode = family.invite_code
    let newCode = ''
    await withServer(makeApp(database, actor), async (baseUrl) => {
      const refreshed = await call(baseUrl, '/api/families/current/invite-code/refresh', { method: 'POST' })
      assert.equal(refreshed.response.status, 200)
      assert.match(refreshed.body.data.inviteCode, /^[0-9A-Za-z]{6}$/)
      assert.notEqual(refreshed.body.data.inviteCode, oldCode)
      assert.equal(database.state.families[0].invite_code, refreshed.body.data.inviteCode)
      assert.equal(database.state.committed, true)
      newCode = refreshed.body.data.inviteCode
    })

    await withServer(makeApp(database, member), async (baseUrl) => {
      const joinWithOldCode = await call(baseUrl, '/api/families/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: oldCode })
      })
      assert.equal(joinWithOldCode.response.status, 404)

      const joinWithNewCode = await call(baseUrl, '/api/families/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: newCode })
      })
      assert.equal(joinWithNewCode.response.status, 201)
    })
  }
})

test('ordinary members cannot refresh the invite code and duplicate updates retry', async () => {
  const memberDatabase = makeDatabase({ memberships: [{ id: 41, family, user_id: member.id, role: 'member' }] })
  await withServer(makeApp(memberDatabase, member), async (baseUrl) => {
    const result = await call(baseUrl, '/api/families/current/invite-code/refresh', { method: 'POST' })
    assert.equal(result.response.status, 403)
    assert.equal(memberDatabase.state.families[0].invite_code, family.invite_code)
  })

  const ownerDatabase = makeDatabase({ memberships: [{ id: 42, family, user_id: owner.id, role: 'owner' }], duplicateInviteRefresh: true })
  await withServer(makeApp(ownerDatabase, owner), async (baseUrl) => {
    const result = await call(baseUrl, '/api/families/current/invite-code/refresh', { method: 'POST' })
    assert.equal(result.response.status, 200)
    assert.equal(ownerDatabase.state.inviteRefreshAttempts, 2)
    assert.notEqual(ownerDatabase.state.families[0].invite_code, family.invite_code)
  })
})

test('owner can transfer ownership atomically and then leave as a normal member', async () => {
  const database = makeDatabase({ memberships: [
    { id: 21, family, user_id: owner.id, role: 'owner' },
    { id: 22, family, user_id: member.id, role: 'member' }
  ] })
  await withServer(makeApp(database, owner), async (baseUrl) => {
    const transferred = await call(baseUrl, '/api/families/current/transfer-ownership', {
      method: 'POST',
      body: JSON.stringify({ memberId: 22 })
    })
    assert.equal(transferred.response.status, 200)
    assert.equal(database.state.families[0].owner_user_id, member.id)
    assert.equal(database.state.memberships.find((item) => item.id === 21).role, 'member')
    assert.equal(database.state.memberships.find((item) => item.id === 22).role, 'owner')
    assert.equal(database.state.committed, true)

    const left = await call(baseUrl, '/api/families/leave', { method: 'POST' })
    assert.equal(left.response.status, 200)
    assert.equal(database.state.memberships.find((item) => item.id === 21).status, 'left')
  })
})

test('delegated admins cannot transfer ownership and cross-family targets are rejected', async () => {
  const database = makeDatabase({ memberships: [{ id: 31, family, user_id: admin.id, role: 'admin' }] })
  await withServer(makeApp(database, admin), async (baseUrl) => {
    let result = await call(baseUrl, '/api/families/current/transfer-ownership', {
      method: 'POST',
      body: JSON.stringify({ memberId: 31 })
    })
    assert.equal(result.response.status, 403)

    const ownerDatabase = makeDatabase({ memberships: [{ id: 32, family, user_id: owner.id, role: 'owner' }] })
    await withServer(makeApp(ownerDatabase, owner), async (ownerBaseUrl) => {
      result = await call(ownerBaseUrl, '/api/families/current/transfer-ownership', {
        method: 'POST',
        body: JSON.stringify({ memberId: 999 })
      })
      assert.equal(result.response.status, 404)
    })
  })
})

test('joining preserves invite-code case and generated codes use six mixed-case alphanumeric characters', async () => {
  const joinDatabase = makeDatabase()
  await withServer(makeApp(joinDatabase, admin), async (baseUrl) => {
    let result = await call(baseUrl, '/api/families/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode: family.invite_code.toLowerCase() })
    })
    assert.equal(result.response.status, 404)

    result = await call(baseUrl, '/api/families/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode: family.invite_code })
    })
    assert.equal(result.response.status, 201)
  })

  const createDatabase = makeDatabase({ families: [], memberships: [], duplicateFamilyInsert: true })
  await withServer(makeApp(createDatabase, owner), async (baseUrl) => {
    const result = await call(baseUrl, '/api/families', {
      method: 'POST',
      body: JSON.stringify({ name: '新家庭' })
    })
    assert.equal(result.response.status, 201)
    assert.match(result.body.data.invite_code, /^[0-9A-Za-z]{6}$/)
    assert.equal(createDatabase.state.familyInsertAttempts, 2)
  })
})

test('family schema upgrade only alters drifted columns and is safe to rerun', async () => {
  const altered = []
  const columns = {
    role: { COLUMN_TYPE: "enum('owner','member')", CHARACTER_SET_NAME: 'utf8mb4', COLLATION_NAME: 'utf8mb4_0900_ai_ci' },
    invite: { COLUMN_TYPE: 'char(6)', CHARACTER_SET_NAME: 'utf8mb4', COLLATION_NAME: 'utf8mb4_0900_ai_ci' }
  }
  const database = {
    execute: async (sql) => {
      if (/column_name = 'role'/i.test(sql)) return [[columns.role]]
      if (/column_name = 'invite_code'/i.test(sql)) return [[columns.invite]]
      if (/MODIFY COLUMN role/i.test(sql)) {
        altered.push('role')
        columns.role.COLUMN_TYPE = "enum('owner','admin','member')"
        return [{ affectedRows: 0 }]
      }
      if (/MODIFY COLUMN invite_code/i.test(sql)) {
        altered.push('invite')
        columns.invite.CHARACTER_SET_NAME = 'ascii'
        columns.invite.COLLATION_NAME = 'ascii_bin'
        return [{ affectedRows: 0 }]
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    }
  }

  await ensureFamilyManagementSchema(database)
  await ensureFamilyManagementSchema(database)
  assert.deepEqual(altered, ['role', 'invite'])
})
