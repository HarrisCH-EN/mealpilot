const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { router } = require('../src/routes/menus')

function makeApp(database) {
  const app = express()
  app.use(express.json())
  app.use('/api', router({
    database,
    auth: (_request, _response, next) => next(),
    family: (request, _response, next) => { request.membership = { family_id: 7 }; next() }
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

test('insights filters both popular dishes and summary metrics to the selected 7-day window', async () => {
  const queries = []
  const database = {
    execute: async (sql, params) => {
      queries.push({ sql, params })
      if (/usedCount/i.test(sql)) return [[{ id: 11, title: '近期开过的菜', category: '荤菜', usedCount: 2 }]]
      if (/COUNT\(DISTINCT m\.id\)/i.test(sql)) return [[{ menuCount: 2, itemCount: 3, averageRating: 4.5 }]]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }

  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/insights?days=7`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      ok: true,
      data: {
        rangeDays: 7,
        popular: [{ id: 11, title: '近期开过的菜', category: '荤菜', usedCount: 2 }],
        summary: { menuCount: 2, itemCount: 3, averageRating: 4.5 }
      }
    })
  })

  assert.equal(queries.length, 2)
  assert.match(queries[0].sql, /DATE_SUB\(CURDATE\(\), INTERVAL 6 DAY\)/)
  assert.deepEqual(queries[0].params, [7, 7])
  assert.match(queries[1].sql, /DATE_SUB\(CURDATE\(\), INTERVAL 6 DAY\)/)
  assert.deepEqual(queries[1].params, [7])
})

test('insights accepts 30 days and rejects unsupported ranges', async () => {
  const queries = []
  const database = {
    execute: async (sql, params) => {
      queries.push({ sql, params })
      if (/usedCount/i.test(sql)) return [[{ id: 12, title: '月度菜谱', category: '素菜', usedCount: 4 }]]
      return [[{ menuCount: 4, itemCount: 8, averageRating: 3 }]]
    }
  }

  await withServer(makeApp(database), async (baseUrl) => {
    const thirtyDayResponse = await fetch(`${baseUrl}/api/insights?days=30`)
    assert.equal(thirtyDayResponse.status, 200)
    assert.equal((await thirtyDayResponse.json()).data.rangeDays, 30)
    assert.match(queries[0].sql, /DATE_SUB\(CURDATE\(\), INTERVAL 29 DAY\)/)

    const invalidResponse = await fetch(`${baseUrl}/api/insights?days=14`)
    assert.equal(invalidResponse.status, 400)
  })
})
