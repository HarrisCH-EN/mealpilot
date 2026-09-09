const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { createToken } = require('../src/auth')
const { createApp } = require('../src/app')
const { router: menuRouter } = require('../src/routes/menus')
const { router: recipeRouter } = require('../src/routes/recipes')

const membership = { family_id: 1, member_id: 101, role: 'owner' }

function makeRouteApp(route, database) {
  const app = express()
  app.use(express.json())
  app.use('/api', route({
    database,
    auth: (_request, _response, next) => next(),
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

test('invalid calendar dates and enum/identifier values return 400 before database writes', async () => {
  const database = {
    execute: async () => { throw new Error('validation should happen before SQL') },
    getConnection: async () => { throw new Error('validation should happen before a connection') }
  }
  await withServer(makeRouteApp(menuRouter, database), async (baseUrl) => {
    const menuDate = await fetch(`${baseUrl}/api/menus?date=2026-02-31`)
    assert.equal(menuDate.status, 400)

    const item = await fetch(`${baseUrl}/api/menus/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ menuDate: '2026-09-08', mealType: 'brunch', recipeId: 0 })
    })
    assert.equal(item.status, 400)

    const recommendation = await fetch(`${baseUrl}/api/recommendations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ menuDate: '2026-09-08', mealType: 'dinner', peopleCount: 0, maxCookMinutes: 90, mode: 'unknown' })
    })
    assert.equal(recommendation.status, 400)
  })
})

test('recipe numeric fields are validated before a transaction begins', async () => {
  let connectionRequested = false
  const database = {
    execute: async () => { throw new Error('validation should happen before SQL') },
    getConnection: async () => { connectionRequested = true; throw new Error('validation should happen before a connection') }
  }
  await withServer(makeRouteApp(recipeRouter, database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recipes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '菜谱', category: '荤菜', steps: '步骤', cookMinutes: 'NaN', difficulty: 2, ingredients: [{ ingredientId: 1, amountGrams: 100 }] })
    })
    assert.equal(response.status, 400)
    assert.equal(connectionRequested, false)
  })
})

test('missing authentication returns 401 and no-active-family access returns 403', async () => {
  const user = { id: 7, openid: 'u-7', display_name: '用户' }
  const noAuthApp = createApp({ database: { execute: async () => { throw new Error('must not query') } } })
  await withServer(noAuthApp, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recipes`)
    assert.equal(response.status, 401)
  })

  const database = {
    execute: async (sql) => {
      if (/FROM users WHERE id =/i.test(sql)) return [[user]]
      if (/FROM family_members fm JOIN families f/i.test(sql)) return [[]]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
  const noFamilyApp = createApp({ database, jwtSecret: 'test-secret' })
  await withServer(noFamilyApp, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recipes`, { headers: { authorization: `Bearer ${createToken(user, 'test-secret')}` } })
    assert.equal(response.status, 403)
  })
})

test('unexpected database errors are returned without SQL or constraint details', async () => {
  const user = { id: 7, openid: 'u-7', display_name: '用户' }
  const database = {
    execute: async (sql) => {
      if (/FROM users WHERE id =/i.test(sql)) return [[user]]
      if (/FROM family_members fm JOIN families f/i.test(sql)) return [[{ ...membership, family_name: '家庭 A' }]]
      if (/FROM recipes/i.test(sql)) {
        const error = new Error("ER_NO_SUCH_TABLE: Table 'smart_meal.secret_table' doesn't exist")
        error.code = 'ER_NO_SUCH_TABLE'
        error.sqlMessage = 'secret_table details'
        throw error
      }
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
  const app = createApp({ database, jwtSecret: 'test-secret' })
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recipes`, { headers: { authorization: `Bearer ${createToken(user, 'test-secret')}` } })
    assert.equal(response.status, 500)
    const data = await response.json()
    assert.equal(data.message, '服务器发生错误')
    assert.doesNotMatch(data.message, /SQL|constraint|smart_meal|secret_table/i)
  })
})
