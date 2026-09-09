const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { router: menuRouter } = require('../src/routes/menus')

test('recommendation restriction query uses the active-member union within the current Family', async () => {
  let restrictionParams
  let connectionUsed = false
  const database = {
    async execute(sql, params) {
      if (/GROUP_CONCAT\(ri\.ingredient_id\)/i.test(sql)) {
        return [[
          { id: 1, title: '受限荤菜', category: '荤菜', cookMinutes: 10, difficulty: 1, ingredientIds: '99' },
          { id: 2, title: '素菜', category: '素菜', cookMinutes: 10, difficulty: 1, ingredientIds: '1' },
          { id: 3, title: '汤', category: '汤', cookMinutes: 10, difficulty: 1, ingredientIds: '2' }
        ]]
      }
      if (/member_ingredient_restrictions/i.test(sql)) {
        assert.match(sql, /fm\.family_id\s*=\s*\?/i)
        assert.match(sql, /fm\.status\s*=\s*'active'/i)
        restrictionParams = params
        return [[{ ingredient_id: 99 }, { ingredient_id: 100 }]]
      }
      if (/member_category_preferences/i.test(sql)) return [[{ memberId: 101, category: null, preferenceScore: null }]]
      connectionUsed = true
      throw new Error(`recommendation should fail before persistence: ${sql}`)
    },
    getConnection: async () => { throw new Error('recommendation should fail before persistence') }
  }
  const app = express()
  app.use(express.json())
  app.use('/api', menuRouter({
    database,
    auth: (_request, _response, next) => next(),
    family: (request, _response, next) => { request.membership = { family_id: 1, member_id: 101 }; next() }
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ message: error.message }))
  const server = await new Promise((resolve) => { const instance = app.listen(0, () => resolve(instance)) })
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/recommendations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ menuDate: '2026-09-08', peopleCount: 2, maxCookMinutes: 90, mode: 'balanced' })
    })
    assert.equal(response.status, 422)
    const data = await response.json()
    assert.match(data.message, /荤菜/)
    assert.deepEqual(restrictionParams, [1])
    assert.equal(connectionUsed, false)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
