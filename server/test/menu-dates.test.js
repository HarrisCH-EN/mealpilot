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

test('menu date summary returns normalized dates and hasMenu markers', async () => {
  const database = {
    execute: async (sql, params) => {
      assert.match(sql, /menu_date BETWEEN/)
      assert.match(sql, /DATE_FORMAT\(m\.menu_date/)
      assert.deepEqual(params, [7, '2026-09-01', '2026-09-30'])
      return [[{ menuDate: new Date('2026-09-06T00:00:00Z'), itemCount: '2', menuCount: '1' }]]
    }
  }
  const app = makeApp(database)
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance))
  })
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/menus/dates?from=2026-09-01&to=2026-09-30`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true, data: [{ menuDate: '2026-09-06', itemCount: 2, menuCount: 1, hasMenu: true }] })
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('menu date summary rejects an inverted date range', async () => {
  const app = makeApp({ execute: async () => { throw new Error('should not query') } })
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance))
  })
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/menus/dates?from=2026-10-01&to=2026-09-01`)
    assert.equal(response.status, 400)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
