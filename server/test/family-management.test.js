const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { requireFamily } = require('../src/middleware/authenticate')
const { router } = require('../src/routes/auth-family')

const familyA = { id: 10, name: '家庭 A', invite_code: 'AAAAAA', owner_user_id: 1 }
const familyB = { id: 20, name: '家庭 B', invite_code: 'BBBBBB', owner_user_id: 4 }
const owner = { id: 1, openid: 'owner', display_name: '家庭创建者', avatar_url: null }
const admin = { id: 2, openid: 'admin', display_name: '家庭管理员', avatar_url: null }
const member = { id: 3, openid: 'member', display_name: '普通成员', avatar_url: null }
const outsider = { id: 4, openid: 'outsider', display_name: '另一个家庭', avatar_url: null }

function makeDatabase({ families = [familyA, familyB], memberships = [] } = {}) {
  const state = {
    families: families.map((family) => ({ ...family })),
    memberships: memberships.map((item, index) => ({
      id: item.id || index + 1,
      family_id: item.family_id || item.family.id,
      family: item.family || families.find((family) => family.id === item.family_id),
      user_id: item.user_id,
      role: item.role || 'member',
      nickname: item.nickname || '家庭成员',
      status: item.status || 'active'
    })),
    nextMemberId: memberships.length + 10
  }

  function rowsForUser(userId) {
    return state.memberships
      .filter((item) => item.user_id === userId && item.status === 'active')
      .map((item) => {
        const family = state.families.find((candidate) => candidate.id === item.family_id)
        return {
          member_id: item.id,
          family_id: item.family_id,
          role: item.role,
          nickname: item.nickname,
          family_name: family.name,
          invite_code: family.invite_code
        }
      })
  }

  async function execute(sql, params) {
    if (/SELECT id FROM users WHERE id = \? FOR UPDATE/i.test(sql)) return [[{ id: params[0] }]]
    if (/FROM family_members fm JOIN families f/i.test(sql)) return [rowsForUser(params[0])]
    if (/SELECT id, status FROM family_members WHERE family_id = \? AND user_id = \? FOR UPDATE/i.test(sql)) {
      const found = state.memberships.find((item) => item.family_id === params[0] && item.user_id === params[1])
      return [found ? [{ id: found.id, status: found.status }] : []]
    }
    if (/SELECT id, user_id, role, status FROM family_members WHERE id = \? AND family_id = \?/i.test(sql)) {
      const found = state.memberships.find((item) => item.id === Number(params[0]) && item.family_id === Number(params[1]) && item.status === 'active')
      return [found ? [{ id: found.id, user_id: found.user_id, role: found.role, status: found.status }] : []]
    }
    if (/SELECT id FROM families WHERE invite_code =/i.test(sql)) {
      const found = state.families.find((family) => family.invite_code === params[0])
      return [found ? [{ id: found.id }] : []]
    }
    if (/INSERT INTO family_members/i.test(sql)) {
      const [familyId, userId, nickname] = params
      state.memberships.push({ id: state.nextMemberId++, family_id: familyId, family: state.families.find((family) => family.id === familyId), user_id: userId, role: /'owner'/i.test(sql) ? 'owner' : 'member', nickname, status: 'active' })
      return [{ affectedRows: 1 }]
    }
    if (/UPDATE family_members SET status = 'active'/i.test(sql)) {
      const [nickname, memberId] = params
      const found = state.memberships.find((item) => item.id === Number(memberId))
      if (found) Object.assign(found, { nickname, role: 'member', status: 'active' })
      return [{ affectedRows: found ? 1 : 0 }]
    }
    if (/UPDATE family_members SET status = 'left'/i.test(sql)) {
      const memberId = params[0]
      const found = state.memberships.find((item) => item.id === Number(memberId) && item.status === 'active')
      if (found) found.status = 'left'
      return [{ affectedRows: found ? 1 : 0 }]
    }
    if (/UPDATE family_members SET role = \?/i.test(sql)) {
      const [role, memberId] = params
      const found = state.memberships.find((item) => item.id === Number(memberId) && item.status === 'active')
      if (found) found.role = role
      return [{ affectedRows: found ? 1 : 0 }]
    }
    if (/UPDATE families SET name =/i.test(sql)) {
      const [name, familyId] = params
      const found = state.families.find((item) => item.id === Number(familyId))
      if (found) found.name = name
      return [{ affectedRows: found ? 1 : 0 }]
    }
    throw new Error(`Unexpected SQL: ${sql}`)
  }

  return {
    state,
    execute,
    getConnection: async () => ({
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
      execute
    })
  }
}

function makeApp(database, actor) {
  const app = express()
  app.use(express.json())
  app.use('/api', router({
    database,
    jwtSecret: 'test-secret',
    devAuthEnabled: false,
    auth: (request, _response, next) => {
      request.user = actor
      next()
    },
    family: requireFamily(database)
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
  return { response, body: await response.json() }
}

test('ordinary members can leave while owners cannot orphan a family', async () => {
  const database = makeDatabase({ memberships: [{ id: 11, family: familyA, user_id: member.id }] })
  await withServer(makeApp(database, member), async (baseUrl) => {
    const result = await call(baseUrl, '/api/families/leave', { method: 'POST' })
    assert.equal(result.response.status, 200)
    assert.equal(database.state.memberships[0].status, 'left')
  })

  const ownerDatabase = makeDatabase({ memberships: [{ id: 12, family: familyA, user_id: owner.id, role: 'owner' }] })
  await withServer(makeApp(ownerDatabase, owner), async (baseUrl) => {
    const result = await call(baseUrl, '/api/families/leave', { method: 'POST' })
    assert.equal(result.response.status, 409)
    assert.equal(ownerDatabase.state.memberships[0].status, 'active')
  })
})

test('a left member can rejoin without creating a duplicate row', async () => {
  const database = makeDatabase({ memberships: [{ id: 13, family: familyA, user_id: member.id, status: 'left' }] })
  await withServer(makeApp(database, member), async (baseUrl) => {
    const result = await call(baseUrl, '/api/families/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode: familyA.invite_code })
    })
    assert.equal(result.response.status, 201)
    assert.equal(database.state.memberships.length, 1)
    assert.equal(database.state.memberships[0].status, 'active')
    assert.equal(database.state.memberships[0].role, 'member')
  })
})

test('all active members can access the invite code', async () => {
  for (const actor of [owner, admin, member]) {
    const database = makeDatabase({ memberships: [{ family: familyA, user_id: actor.id, role: actor === owner ? 'owner' : 'admin' }] })
    await withServer(makeApp(database, actor), async (baseUrl) => {
      const result = await call(baseUrl, '/api/families/current/invite-code')
      assert.equal(result.response.status, 200)
      assert.equal(result.body.data.inviteCode, familyA.invite_code)
    })
  }
})

test('owners and delegated admins can rename the current family while members cannot', async () => {
  for (const actor of [owner, admin]) {
    const database = makeDatabase({ memberships: [{ family: familyA, user_id: actor.id, role: actor === owner ? 'owner' : 'admin' }] })
    await withServer(makeApp(database, actor), async (baseUrl) => {
      let result = await call(baseUrl, '/api/families/current/name', {
        method: 'PATCH',
        body: JSON.stringify({ name: '  新家庭名称  ' })
      })
      assert.equal(result.response.status, 200)
      assert.equal(database.state.families[0].name, '新家庭名称')
      assert.equal(result.body.data.name, '新家庭名称')

      result = await call(baseUrl, '/api/families/current/name', {
        method: 'PATCH',
        body: JSON.stringify({ name: '   ' })
      })
      assert.equal(result.response.status, 400)
    })
  }

  const memberDatabase = makeDatabase({ memberships: [{ family: familyA, user_id: member.id, role: 'member' }] })
  await withServer(makeApp(memberDatabase, member), async (baseUrl) => {
    let result = await call(baseUrl, '/api/families/current/name', {
      method: 'PATCH',
      body: JSON.stringify({ name: '不应修改' })
    })
    assert.equal(result.response.status, 403)
    assert.equal(memberDatabase.state.families[0].name, familyA.name)

  })
})

test('admins can promote, demote, and remove active members', async () => {
  const database = makeDatabase({ memberships: [
    { id: 21, family: familyA, user_id: admin.id, role: 'admin' },
    { id: 22, family: familyA, user_id: member.id, role: 'member' }
  ] })
  await withServer(makeApp(database, admin), async (baseUrl) => {
    let result = await call(baseUrl, '/api/families/current/members/22/role', { method: 'PATCH', body: JSON.stringify({ role: 'admin' }) })
    assert.equal(result.response.status, 200)
    assert.equal(database.state.memberships.find((item) => item.id === 22).role, 'admin')

    result = await call(baseUrl, '/api/families/current/members/22/role', { method: 'PATCH', body: JSON.stringify({ role: 'member' }) })
    assert.equal(result.response.status, 200)
    assert.equal(database.state.memberships.find((item) => item.id === 22).role, 'member')

    result = await call(baseUrl, '/api/families/current/members/22', { method: 'DELETE' })
    assert.equal(result.response.status, 200)
    assert.equal(database.state.memberships.find((item) => item.id === 22).status, 'left')
  })
})

test('members cannot manage others and owner rows are protected', async () => {
  const database = makeDatabase({ memberships: [
    { id: 31, family: familyA, user_id: member.id, role: 'member' },
    { id: 32, family: familyA, user_id: owner.id, role: 'owner' }
  ] })
  await withServer(makeApp(database, member), async (baseUrl) => {
    const result = await call(baseUrl, '/api/families/current/members/32', { method: 'DELETE' })
    assert.equal(result.response.status, 403)
  })

  const adminDatabase = makeDatabase({ memberships: [
    { id: 33, family: familyA, user_id: admin.id, role: 'admin' },
    { id: 34, family: familyA, user_id: owner.id, role: 'owner' }
  ] })
  await withServer(makeApp(adminDatabase, admin), async (baseUrl) => {
    let result = await call(baseUrl, '/api/families/current/members/34/role', { method: 'PATCH', body: JSON.stringify({ role: 'member' }) })
    assert.equal(result.response.status, 409)
    result = await call(baseUrl, '/api/families/current/members/34', { method: 'DELETE' })
    assert.equal(result.response.status, 409)
    result = await call(baseUrl, '/api/families/current/members/33', { method: 'DELETE' })
    assert.equal(result.response.status, 409)
  })
})

test('member management is scoped to the administrator current family', async () => {
  const database = makeDatabase({ memberships: [
    { id: 41, family: familyA, user_id: admin.id, role: 'admin' },
    { id: 42, family: familyB, user_id: outsider.id, role: 'member' }
  ] })
  await withServer(makeApp(database, admin), async (baseUrl) => {
    const result = await call(baseUrl, '/api/families/current/members/42', { method: 'DELETE' })
    assert.equal(result.response.status, 404)
    assert.equal(database.state.memberships.find((item) => item.id === 42).status, 'active')
  })
})
