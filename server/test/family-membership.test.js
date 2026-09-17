const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { currentMembership } = require('../src/middleware/authenticate')
const { router } = require('../src/routes/auth-family')

const user = { id: 1, openid: 'user-1', display_name: '测试用户', avatar_url: null }

function membershipRow(member) {
  const family = member.family
  return {
    member_id: member.id,
    family_id: family.id,
    role: member.role || 'member',
    nickname: member.nickname || user.display_name,
    family_name: family.name,
    invite_code: family.invite_code
  }
}

function makeDatabase({ memberships = [], families = [] } = {}) {
  const state = {
    memberships: memberships.map((member, index) => ({
      id: member.id || index + 1,
      family: member.family,
      user_id: member.user_id || user.id,
      role: member.role,
      nickname: member.nickname,
      status: member.status || 'active'
    })),
    families,
    nextFamilyId: 100,
    nextMemberId: memberships.length + 1,
    locks: new Map()
  }

  const lockFor = (userId) => {
    if (!state.locks.has(userId)) {
      state.locks.set(userId, { tail: Promise.resolve() })
    }
    return state.locks.get(userId)
  }

  const membershipRows = (userId) => state.memberships
    .filter((member) => member.user_id === userId && member.status === 'active')
    .map(membershipRow)

  const execute = async (sql, params, connection) => {
    if (/SELECT id FROM users WHERE id = \? FOR UPDATE/i.test(sql)) {
      const lock = lockFor(params[0])
      const previous = lock.tail
      let release
      lock.tail = new Promise((resolve) => { release = resolve })
      await previous
      connection.releaseUserLock = release
      return [[{ id: params[0] }]]
    }

    if (/FROM family_members fm JOIN families f/i.test(sql)) {
      return [membershipRows(params[0])]
    }

    if (/SELECT id FROM families WHERE invite_code =/i.test(sql)) {
      const family = state.families.find((item) => item.invite_code === params[0])
      return [family ? [{ id: family.id }] : []]
    }

    if (/SELECT id, status FROM family_members WHERE family_id = \? AND user_id = \? FOR UPDATE/i.test(sql)) {
      const member = state.memberships.find((item) => item.family.id === params[0] && item.user_id === params[1])
      return [member ? [{ id: member.id, status: member.status }] : []]
    }

    if (/UPDATE family_members SET status = 'active'/i.test(sql)) {
      const [nickname, memberId] = params
      const member = state.memberships.find((item) => item.id === memberId)
      if (member) Object.assign(member, { nickname, role: 'member', status: 'active' })
      return [{ affectedRows: member ? 1 : 0 }]
    }

    if (/INSERT INTO families/i.test(sql)) {
      const [name, inviteCode, ownerUserId] = params
      const family = { id: state.nextFamilyId++, name, invite_code: inviteCode, owner_user_id: ownerUserId }
      state.families.push(family)
      return [{ insertId: family.id }]
    }

    if (/SELECT id, name, invite_code, owner_user_id FROM families WHERE id =/i.test(sql)) {
      const family = state.families.find((item) => item.id === params[0])
      return [family ? [family] : []]
    }

    if (/INSERT INTO family_members/i.test(sql)) {
      const [familyId, userId, nickname] = params
      const family = state.families.find((item) => item.id === familyId)
      state.memberships.push({
        id: state.nextMemberId++,
        family,
        user_id: userId,
        role: /'owner'/i.test(sql) ? 'owner' : 'member',
        nickname,
        status: 'active'
      })
      return [{ affectedRows: 1 }]
    }

    throw new Error(`Unexpected SQL: ${sql}`)
  }

  return {
    state,
    execute: (sql, params) => execute(sql, params, null),
    getConnection: async () => {
      const connection = {
        releaseUserLock: null,
        beginTransaction: async () => {},
        commit: async () => {
          if (connection.releaseUserLock) {
            connection.releaseUserLock()
            connection.releaseUserLock = null
          }
        },
        rollback: async () => {
          if (connection.releaseUserLock) {
            connection.releaseUserLock()
            connection.releaseUserLock = null
          }
        },
        release: () => {},
        execute: (sql, params) => execute(sql, params, connection)
      }
      return connection
    }
  }
}

function makeApp(database, seedStarterRecipes = async () => {}) {
  const app = express()
  app.use(express.json())
  app.use('/api', router({
    database,
    jwtSecret: 'test-secret',
    devAuthEnabled: false,
    auth: (request, _response, next) => {
      request.user = user
      next()
    },
    family: (_request, _response, next) => next(),
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

test('currentMembership returns null when the user has no active membership', async () => {
  let query
  const database = {
    execute: async (sql, params) => {
      query = { sql, params }
      return [[]]
    }
  }

  assert.equal(await currentMembership(database, user.id), null)
  assert.deepEqual(query.params, [user.id])
  assert.doesNotMatch(query.sql, /LIMIT\s+1/i)
})

test('currentMembership returns the only active membership', async () => {
  const expected = {
    member_id: 3,
    family_id: 8,
    role: 'member',
    nickname: '测试用户',
    family_name: '家庭 A',
    invite_code: 'ABC123'
  }
  const database = { execute: async () => [[expected]] }

  assert.deepEqual(await currentMembership(database, user.id), expected)
})

test('currentMembership rejects conflicting active memberships without exposing family details', async () => {
  const database = {
    execute: async () => [[
      { member_id: 1, family_id: 10, family_name: '家庭 A' },
      { member_id: 2, family_id: 20, family_name: '家庭 B' }
    ]]
  }

  await assert.rejects(
    currentMembership(database, user.id),
    (error) => {
      assert.equal(error.status, 500)
      assert.match(error.message, /家庭关系数据冲突/)
      assert.doesNotMatch(error.message, /家庭 A|家庭 B|10|20/)
      return true
    }
  )
})

test('left membership is not treated as the current active membership', async () => {
  const database = {
    execute: async (sql) => {
      assert.match(sql, /status = 'active'/i)
      return [[]]
    }
  }

  assert.equal(await currentMembership(database, user.id), null)
})

test('join rejects a user who already belongs to another active family', async () => {
  const familyA = { id: 10, name: '家庭 A', invite_code: 'AAAAAA' }
  const familyB = { id: 20, name: '家庭 B', invite_code: 'BBBBBB' }
  const database = makeDatabase({
    families: [familyA, familyB],
    memberships: [{ family: familyA }]
  })

  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/families/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inviteCode: familyB.invite_code })
    })
    assert.equal(response.status, 409)
    assert.equal(database.state.memberships.length, 1)
  })
})

test('join succeeds when the user has no active family', async () => {
  const family = { id: 10, name: '家庭 A', invite_code: 'AAAAAA' }
  const database = makeDatabase({ families: [family] })

  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/families/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inviteCode: family.invite_code })
    })
    assert.equal(response.status, 201)
    assert.equal((await response.json()).data.family_id, family.id)
    assert.equal(database.state.memberships.length, 1)
  })
})

test('joining the same family again keeps the existing 409 contract', async () => {
  const family = { id: 10, name: '家庭 A', invite_code: 'AAAAAA' }
  const database = makeDatabase({
    families: [family],
    memberships: [{ family }]
  })

  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/families/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inviteCode: family.invite_code })
    })
    assert.equal(response.status, 409)
    assert.equal(database.state.memberships.length, 1)
  })
})

test('create family succeeds when the user has no active family', async () => {
  const database = makeDatabase()

  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/families`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '新家庭' })
    })
    assert.equal(response.status, 201)
    assert.equal(database.state.memberships.filter((member) => member.status === 'active').length, 1)
    assert.equal(database.state.memberships[0].role, 'owner')
  })
})

test('create family rejects a user who already has an active family', async () => {
  const family = { id: 10, name: '家庭 A', invite_code: 'AAAAAA' }
  const database = makeDatabase({ families: [family], memberships: [{ family }] })

  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/families`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '不应创建' })
    })
    assert.equal(response.status, 409)
    assert.equal(database.state.memberships.length, 1)
  })
})

test('concurrent joins serialize on the user row and create at most one active membership', async () => {
  const familyA = { id: 10, name: '家庭 A', invite_code: 'AAAAAA' }
  const familyB = { id: 20, name: '家庭 B', invite_code: 'BBBBBB' }
  const database = makeDatabase({ families: [familyA, familyB] })

  await withServer(makeApp(database), async (baseUrl) => {
    const responses = await Promise.all([familyA, familyB].map((family) => fetch(`${baseUrl}/api/families/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inviteCode: family.invite_code })
    })))

    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409])
    assert.equal(database.state.memberships.filter((member) => member.status === 'active').length, 1)
  })
})
