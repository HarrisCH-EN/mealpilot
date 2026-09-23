const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { router } = require('../src/routes/feedback')

const membership = { family_id: 1, member_id: 101, role: 'admin' }

function makeDatabase({ menuFamilyId = 1, fail = false } = {}) {
  const state = { feedback: [], menuItem: { id: 7, familyId: menuFamilyId } }
  const database = {
    state,
    async execute(sql, params) {
      if (fail) throw new Error('ER_NO_SUCH_TABLE: secret')
      if (/FROM menu_items mi JOIN menus m/i.test(sql)) {
        return [state.menuItem.familyId === params[1] && state.menuItem.id === Number(params[0]) ? [{ id: 7 }] : []]
      }
      if (/FROM menu_feedback WHERE/i.test(sql)) {
        const item = state.feedback.find((entry) => entry.menuItemId === Number(params[0]) && entry.memberId === Number(params[1]))
        return [item ? [{ rating: item.rating, comment: item.comment }] : []]
      }
      if (/INSERT INTO menu_feedback/i.test(sql)) {
        const [menuItemId, memberId, rating, comment] = params
        const existing = state.feedback.find((entry) => entry.menuItemId === Number(menuItemId) && entry.memberId === Number(memberId))
        if (existing) { existing.rating = Number(rating); existing.comment = comment; return [{ affectedRows: 2 }] }
        state.feedback.push({ menuItemId: Number(menuItemId), memberId: Number(memberId), rating: Number(rating), comment })
        return [{ affectedRows: 1 }]
      }
      if (/DELETE f FROM menu_feedback/i.test(sql)) {
        const before = state.feedback.length
        state.feedback = state.feedback.filter((entry) => !(entry.menuItemId === Number(params[0]) && entry.memberId === Number(params[1])))
        return [{ affectedRows: before - state.feedback.length }]
      }
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
  return database
}

function makeApp(database, { authenticated = true, hasFamily = true } = {}) {
  const app = express()
  app.use(express.json())
  app.use('/api', router({
    database,
    auth: (_request, _response, next) => authenticated ? next() : next({ status: 401, message: '未登录' }),
    family: (request, _response, next) => hasFamily ? (request.membership = membership, next()) : next({ status: 403, message: '没有 active Family' })
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, message: error.message === 'ER_NO_SUCH_TABLE: secret' ? '服务器发生错误' : error.message }))
  return app
}

async function withServer(app, callback) {
  const server = await new Promise((resolve) => { const instance = app.listen(0, () => resolve(instance)) })
  try { return await callback(`http://127.0.0.1:${server.address().port}`) } finally { await new Promise((resolve) => server.close(resolve)) }
}

async function jsonRequest(baseUrl, path, method = 'GET', body) {
  return fetch(`${baseUrl}${path}`, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
}

test('feedback API saves, reads, updates idempotently, and deletes only the current member relation', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database), async (baseUrl) => {
    let response = await jsonRequest(baseUrl, '/api/menu-items/7/feedback', 'PUT', { rating: 4, comment: '很好吃' })
    assert.equal(response.status, 201)
    response = await jsonRequest(baseUrl, '/api/menu-items/7/feedback')
    assert.deepEqual((await response.json()).data, { rating: 4, comment: '很好吃' })
    response = await jsonRequest(baseUrl, '/api/menu-items/7/feedback', 'PUT', { rating: 5, comment: '更喜欢' })
    assert.equal(response.status, 200)
    assert.equal(database.state.feedback.length, 1)
    assert.deepEqual(database.state.feedback[0], { menuItemId: 7, memberId: 101, rating: 5, comment: '更喜欢' })
    response = await jsonRequest(baseUrl, '/api/menu-items/7/feedback', 'DELETE')
    assert.deepEqual((await response.json()).data, { menuItemId: 7, status: 'removed' })
    response = await jsonRequest(baseUrl, '/api/menu-items/7/feedback', 'DELETE')
    assert.deepEqual((await response.json()).data, { menuItemId: 7, status: 'already-absent' })
  })
  assert.equal(database.state.feedback.length, 0)
})

test('feedback API returns 404 for another Family and never writes it', async () => {
  const database = makeDatabase({ menuFamilyId: 2 })
  await withServer(makeApp(database), async (baseUrl) => {
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const response = await jsonRequest(baseUrl, '/api/menu-items/7/feedback', method, method === 'PUT' ? { rating: 5 } : undefined)
      assert.equal(response.status, 404)
    }
  })
  assert.deepEqual(database.state.feedback, [])
})

test('feedback API validates rating and comment without mutating menu data', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database), async (baseUrl) => {
    for (const rating of [0, 6, 'bad']) assert.equal((await jsonRequest(baseUrl, '/api/menu-items/7/feedback', 'PUT', { rating })).status, 400)
    assert.equal((await jsonRequest(baseUrl, '/api/menu-items/7/feedback', 'PUT', { rating: 4, comment: 'x'.repeat(201) })).status, 400)
  })
  assert.deepEqual(database.state.feedback, [])
})

test('feedback API distinguishes invalid MenuItem ids from cross-Family resources', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database), async (baseUrl) => {
    assert.equal((await jsonRequest(baseUrl, '/api/menu-items/0/feedback')).status, 400)
    assert.equal((await jsonRequest(baseUrl, '/api/menu-items/99/feedback')).status, 404)
  })
})

test('feedback API requires authentication and an active Family', async () => {
  for (const options of [{ authenticated: false }, { hasFamily: false }]) {
    const database = makeDatabase()
    await withServer(makeApp(database, options), async (baseUrl) => assert.equal((await jsonRequest(baseUrl, '/api/menu-items/7/feedback')).status, options.authenticated === false ? 401 : 403))
  }
})

test('feedback API sanitizes database errors', async () => {
  await withServer(makeApp(makeDatabase({ fail: true })), async (baseUrl) => {
    const response = await jsonRequest(baseUrl, '/api/menu-items/7/feedback')
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { ok: false, message: '服务器发生错误' })
  })
})
