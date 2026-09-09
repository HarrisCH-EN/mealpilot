const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')

const { router } = require('../src/routes/menus')

function makeDatabase(preferenceRows, { failPreferenceQuery = false } = {}) {
  const calls = []
  const connection = {
    async beginTransaction() { calls.push('begin') },
    async commit() { calls.push('commit') },
    async rollback() { calls.push('rollback') },
    release() { calls.push('release') },
    async execute(sql, params = []) {
      calls.push({ sql, params })
      if (/FROM family_members WHERE/i.test(sql)) return [[{ id: 101 }]]
      if (/FROM recipes WHERE/i.test(sql)) return [[{ id: 1 }, { id: 2 }, { id: 3 }]]
      if (/INSERT INTO recommendation_runs/i.test(sql)) return [{ insertId: 501 }]
      if (/INSERT INTO recommendation_items/i.test(sql)) return [{ insertId: 601 }]
      return [[]]
    }
  }
  return {
    calls,
    async execute(sql, params = []) {
      calls.push({ sql, params })
      if (/FROM recipes r/i.test(sql)) return [[
        { id: 1, title: '荤菜候选', category: '荤菜', cookMinutes: 20, difficulty: 1, ingredientIds: '1' },
        { id: 2, title: '素菜候选', category: '素菜', cookMinutes: 20, difficulty: 1, ingredientIds: '2' },
        { id: 3, title: '汤候选', category: '汤', cookMinutes: 20, difficulty: 1, ingredientIds: '3' }
      ]]
      if (/member_ingredient_restrictions/i.test(sql)) return [[]]
      if (/member_category_preferences/i.test(sql)) {
        if (failPreferenceQuery) throw new Error('preference db unavailable')
        return [preferenceRows]
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    },
    async getConnection() { return connection }
  }
}

function makeApp(database) {
  const app = express()
  app.use(express.json())
  app.use('/api', router({
    database,
    auth: (_request, _response, next) => next(),
    family: (request, _response, next) => { request.membership = { family_id: 1, member_id: 101 }; next() }
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, message: error.status ? error.message : '服务器发生错误' }))
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

test('recommendation route reads family preferences once and persists aligned score and reason', async () => {
  const database = makeDatabase([
    { memberId: 101, category: '荤菜', preferenceScore: 5 },
    { memberId: 102, category: '荤菜', preferenceScore: 1 },
    { memberId: 103, category: null, preferenceScore: null }
  ])
  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recommendations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ menuDate: '2026-08-08', mealType: 'dinner', peopleCount: 2, maxCookMinutes: 90, mode: 'balanced' }) })
    assert.equal(response.status, 200)
    const data = (await response.json()).data
    const meat = data.items.find((item) => item.id === 1)
    assert.equal(meat.score.parts.preference, 70)
    assert.match(meat.score.reason, /家庭对荤菜偏好中性/)
    assert.equal(data.runId, 501)
    assert.equal(database.calls.filter((call) => typeof call !== 'string' && /member_category_preferences/i.test(call.sql)).length, 1)
  })
})

test('preference database failure returns generic 500 instead of neutral fallback', async () => {
  const database = makeDatabase([], { failPreferenceQuery: true })
  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recommendations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ menuDate: '2026-08-08', mealType: 'dinner', peopleCount: 2, maxCookMinutes: 90, mode: 'balanced' }) })
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { ok: false, message: '服务器发生错误' })
  })
})
