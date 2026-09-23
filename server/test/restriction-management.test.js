const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')

const { router } = require('../src/routes/restrictions')

function makeDatabase() {
  const state = {
    members: [
      { id: 101, user_id: 1, family_id: 1, role: 'admin', status: 'active' },
      { id: 102, user_id: 2, family_id: 1, role: 'member', status: 'active' },
      { id: 201, user_id: 3, family_id: 2, role: 'member', status: 'active' },
      { id: 103, user_id: 4, family_id: 1, role: 'member', status: 'left' }
    ],
    ingredients: [
      { id: 1, name: '花生' },
      { id: 2, name: '虾' }
    ],
    restrictions: [{ member_id: 102, ingredient_id: 1 }]
  }

  const execute = async (sql, params = []) => {
    if (/FROM family_members fm/i.test(sql) && /status = 'active'/i.test(sql)) {
      const member = state.members.find((item) => item.id === Number(params[0]) && item.family_id === Number(params[1]) && item.status === 'active')
      return [member ? [member] : []]
    }
    if (/SELECT id, name FROM ingredients/i.test(sql)) {
      const ingredient = state.ingredients.find((item) => item.id === Number(params[0]))
      return [ingredient ? [ingredient] : []]
    }
    if (/FROM member_ingredient_restrictions mir/i.test(sql) && /SELECT mir.ingredient_id/i.test(sql)) {
      const memberId = Number(params[0])
      const member = state.members.find((item) => item.id === memberId)
      const rows = state.restrictions
        .filter((item) => item.member_id === memberId)
        .map((item) => ({ ingredientId: item.ingredient_id, ingredientName: state.ingredients.find((ingredient) => ingredient.id === item.ingredient_id).name }))
      return [member && member.status === 'active' ? rows : []]
    }
    if (/SELECT 1 FROM member_ingredient_restrictions/i.test(sql)) {
      const found = state.restrictions.some((item) => item.member_id === Number(params[0]) && item.ingredient_id === Number(params[1]))
      return [found ? [{ present: 1 }] : []]
    }
    if (/INSERT INTO member_ingredient_restrictions/i.test(sql)) {
      const memberId = Number(params[0])
      const ingredientId = Number(params[1])
      if (state.restrictions.some((item) => item.member_id === memberId && item.ingredient_id === ingredientId)) {
        const error = new Error('duplicate')
        error.code = 'ER_DUP_ENTRY'
        throw error
      }
      state.restrictions.push({ member_id: memberId, ingredient_id: ingredientId })
      return [{ affectedRows: 1 }]
    }
    if (/DELETE FROM member_ingredient_restrictions/i.test(sql)) {
      const before = state.restrictions.length
      state.restrictions = state.restrictions.filter((item) => !(item.member_id === Number(params[0]) && item.ingredient_id === Number(params[1])))
      return [{ affectedRows: before - state.restrictions.length }]
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

test('owner can read another active family member restrictions', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database, { user_id: 1, family_id: 1, member_id: 101, role: 'admin' }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/family-members/102/restrictions`)
    assert.equal(response.status, 200)
    assert.deepEqual((await response.json()).data, [{ ingredientId: 1, ingredientName: '花生' }])
  })
})

test('normal member can read another active family member restrictions', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database, { user_id: 2, family_id: 1, member_id: 102, role: 'member' }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/family-members/101/restrictions`)
    assert.equal(response.status, 200)
    assert.deepEqual((await response.json()).data, [])
  })
})

test('normal member cannot manage another family member restriction', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database, { user_id: 2, family_id: 1, member_id: 102, role: 'member' }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/family-members/101/restrictions`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ingredientId: 2 })
    })
    assert.equal(response.status, 403)
  })
})

test('cross-family and left members are indistinguishable from missing members', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database, { user_id: 1, family_id: 1, member_id: 101, role: 'admin' }), async (baseUrl) => {
    for (const memberId of [201, 103, 999]) {
      const response = await fetch(`${baseUrl}/api/family-members/${memberId}/restrictions`)
      assert.equal(response.status, 404)
    }
  })
})

test('adding a restriction is idempotent and uses the existing ingredient', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database, { user_id: 1, family_id: 1, member_id: 101, role: 'admin' }), async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/family-members/102/restrictions`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ingredientId: 2 })
    })
    const second = await fetch(`${baseUrl}/api/family-members/102/restrictions`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ingredientId: 2 })
    })
    assert.equal(first.status, 201)
    assert.equal((await first.json()).data.status, 'created')
    assert.equal(second.status, 200)
    assert.equal((await second.json()).data.status, 'already-present')
    assert.equal(database.state.restrictions.filter((item) => item.member_id === 102 && item.ingredient_id === 2).length, 1)
  })
})

test('invalid ingredient is rejected without creating a restriction', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database, { user_id: 1, family_id: 1, member_id: 101, role: 'admin' }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/family-members/102/restrictions`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ingredientId: 999 })
    })
    assert.equal(response.status, 404)
    assert.equal(database.state.restrictions.length, 1)
  })
})

test('deleting a restriction removes only the relation and is idempotent', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database, { user_id: 2, family_id: 1, member_id: 102, role: 'member' }), async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/family-members/102/restrictions/1`, { method: 'DELETE' })
    const second = await fetch(`${baseUrl}/api/family-members/102/restrictions/1`, { method: 'DELETE' })
    assert.equal(first.status, 200)
    assert.equal((await first.json()).data.status, 'removed')
    assert.equal(second.status, 200)
    assert.equal((await second.json()).data.status, 'already-absent')
    assert.equal(database.state.ingredients.length, 2)
    assert.equal(database.state.members.length, 4)
  })
})
