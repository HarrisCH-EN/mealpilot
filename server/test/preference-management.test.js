const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')

const { router } = require('../src/routes/preferences')

function makeDatabase() {
  const state = {
    members: [
      { id: 101, user_id: 1, family_id: 1, role: 'admin', status: 'active' },
      { id: 102, user_id: 2, family_id: 1, role: 'member', status: 'active' },
      { id: 201, user_id: 3, family_id: 2, role: 'member', status: 'active' },
      { id: 103, user_id: 4, family_id: 1, role: 'member', status: 'left' }
    ],
    preferences: [{ member_id: 102, category: '荤菜', preference_score: 5 }]
  }

  const execute = async (sql, params = []) => {
    if (/FROM family_members fm/i.test(sql) && /status = 'active'/i.test(sql)) {
      const member = state.members.find((item) => item.id === Number(params[0]) && item.family_id === Number(params[1]) && item.status === 'active')
      return [member ? [member] : []]
    }
    if (/FROM member_category_preferences mcp/i.test(sql) && /fm.family_id/i.test(sql)) {
      const familyId = Number(params[0])
      const activeMemberIds = new Set(state.members.filter((member) => member.family_id === familyId && member.status === 'active').map((member) => member.id))
      return [state.preferences.filter((item) => activeMemberIds.has(item.member_id)).map((item) => ({ memberId: item.member_id, category: item.category, preferenceScore: item.preference_score }))]
    }
    if (/DELETE FROM member_category_preferences/i.test(sql)) {
      const before = state.preferences.length
      state.preferences = state.preferences.filter((item) => !(item.member_id === Number(params[0]) && item.category === params[1]))
      return [{ affectedRows: before - state.preferences.length }]
    }
    if (/FROM member_category_preferences/i.test(sql) && /WHERE member_id/i.test(sql)) {
      const rows = state.preferences
        .filter((item) => item.member_id === Number(params[0]))
        .map((item) => ({ category: item.category, preferenceScore: item.preference_score }))
      return [rows]
    }
    if (/INSERT INTO member_category_preferences/i.test(sql)) {
      const memberId = Number(params[0])
      const category = params[1]
      const score = Number(params[2])
      const existing = state.preferences.find((item) => item.member_id === memberId && item.category === category)
      if (existing) existing.preference_score = score
      else state.preferences.push({ member_id: memberId, category, preference_score: score })
      return [{ affectedRows: existing ? 2 : 1 }]
    }
    throw new Error(`Unexpected SQL: ${sql}`)
  }

  return { state, execute }
}

function makeApp(database, membership) {
  const app = express()
  app.use(express.json())
  app.use('/api', router({
    database,
    auth: (request, _response, next) => { request.user = { id: membership.user_id }; next() },
    family: (request, _response, next) => { request.membership = membership; next() }
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ message: error.message }))
  return app
}

async function withServer(app, callback) {
  const server = await new Promise((resolve) => { const instance = app.listen(0, () => resolve(instance)) })
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('owner can read another active family member preferences and summary stays family scoped', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database, { user_id: 1, family_id: 1, member_id: 101, role: 'admin' }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/family-members/102/preferences`)
    assert.equal(response.status, 200)
    assert.deepEqual((await response.json()).data, [{ category: '荤菜', preferenceScore: 5 }])
    const summary = await fetch(`${baseUrl}/api/families/current/preferences`)
    assert.equal(summary.status, 200)
    assert.deepEqual((await summary.json()).data, [{ memberId: 102, category: '荤菜', preferenceScore: 5 }])
  })
})

test('normal member can read and update only their own active preference', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database, { user_id: 2, family_id: 1, member_id: 102, role: 'member' }), async (baseUrl) => {
    const own = await fetch(`${baseUrl}/api/family-members/102/preferences`)
    assert.equal(own.status, 200)
    const other = await fetch(`${baseUrl}/api/family-members/101/preferences`)
    assert.equal(other.status, 403)
    const save = await fetch(`${baseUrl}/api/family-members/102/preferences/素菜`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preferenceScore: 1 })
    })
    assert.equal(save.status, 200)
    assert.equal((await save.json()).data.status, 'saved')
    assert.equal(database.state.preferences.find((item) => item.category === '素菜').preference_score, 1)
  })
})

test('cross-family and left members cannot be read or edited', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database, { user_id: 1, family_id: 1, member_id: 101, role: 'admin' }), async (baseUrl) => {
    for (const memberId of [201, 103, 999]) {
      const response = await fetch(`${baseUrl}/api/family-members/${memberId}/preferences`)
      assert.equal(response.status, 404)
      const mutation = await fetch(`${baseUrl}/api/family-members/${memberId}/preferences/荤菜`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preferenceScore: 3 })
      })
      assert.equal(mutation.status, 404)
    }
  })
})

test('preference PUT is idempotent, updates instead of duplicating, and validates category and score', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database, { user_id: 1, family_id: 1, member_id: 101, role: 'admin' }), async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/family-members/101/preferences/汤`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preferenceScore: 3 })
    })
    const second = await fetch(`${baseUrl}/api/family-members/101/preferences/汤`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preferenceScore: 3 })
    })
    const update = await fetch(`${baseUrl}/api/family-members/101/preferences/汤`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preferenceScore: 1 })
    })
    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    assert.equal(update.status, 200)
    assert.equal(database.state.preferences.filter((item) => item.member_id === 101 && item.category === '汤').length, 1)
    assert.equal(database.state.preferences.find((item) => item.member_id === 101 && item.category === '汤').preference_score, 1)

    const invalidCategory = await fetch(`${baseUrl}/api/family-members/101/preferences/甜点`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preferenceScore: 3 })
    })
    const invalidScore = await fetch(`${baseUrl}/api/family-members/101/preferences/主食`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preferenceScore: 6 })
    })
    assert.equal(invalidCategory.status, 400)
    assert.equal(invalidScore.status, 400)
  })
})

test('DELETE removes only the preference relation and is idempotent', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database, { user_id: 1, family_id: 1, member_id: 102, role: 'member' }), async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/family-members/102/preferences/荤菜`, { method: 'DELETE' })
    const second = await fetch(`${baseUrl}/api/family-members/102/preferences/荤菜`, { method: 'DELETE' })
    assert.equal(first.status, 200)
    assert.equal((await first.json()).data.status, 'removed')
    assert.equal(second.status, 200)
    assert.equal((await second.json()).data.status, 'already-absent')
    assert.equal(database.state.members.length, 4)
  })
})
