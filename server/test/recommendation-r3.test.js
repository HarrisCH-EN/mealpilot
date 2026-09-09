const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')

const {
  applyCanonicalRecommendationRun,
  applyRecommendationRequest,
  persistCanonicalRecommendationRun,
  loadPersistedCandidate
} = require('../src/services/recommendation-run-service')
const { router: menuRouter } = require('../src/routes/menus')

const canonicalRequest = {
  menuDate: '2026-11-08',
  mealType: 'dinner',
  peopleCount: 3,
  maxPrepMinutes: 80,
  structure: { meat: 1, vegetable: 1, soup: 1, staple: 0 },
  preferences: { selectedTagIds: [] }
}

const canonicalResult = {
  candidates: [{
    candidateId: 'memory-1',
    rank: 1,
    items: [
      { recipeId: 11, title: '荤菜', category: '荤菜', cookMinutes: 20, coverUrl: '', dishScore: 82, reason: '匹配本次偏好' },
      { recipeId: 12, title: '素菜', category: '素菜', cookMinutes: 10, coverUrl: '', dishScore: 70, reason: '纳入指定结构候选' },
      { recipeId: 13, title: '汤', category: '汤', cookMinutes: 30, coverUrl: '', dishScore: 75, reason: '季节匹配较好' }
    ],
    estimatedPrepMinutes: 40,
    totalScore: 84,
    scoreBreakdown: { preference: 80, nutrition: 70 },
    reason: '满足指定菜单结构'
  }]
}

test('canonical Run persistence writes nullable legacy fields and canonical snapshots on one connection', async () => {
  const calls = []
  let candidateId = 700
  const connection = {
    async execute(sql, params = []) {
      calls.push({ sql, params })
      if (/FROM family_members/i.test(sql)) return [[{ id: 101 }]]
      if (/SELECT id FROM recipes/i.test(sql)) return [[{ id: 11 }, { id: 12 }, { id: 13 }]]
      if (/INSERT INTO recommendation_runs/i.test(sql)) return [{ insertId: 501 }]
      if (/INSERT INTO recommendation_candidates/i.test(sql)) return [{ insertId: candidateId++ }]
      if (/INSERT INTO recommendation_candidate_items/i.test(sql)) return [{ affectedRows: 1 }]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
  const runId = await persistCanonicalRecommendationRun({
    connection,
    familyId: 1,
    memberId: 101,
    request: canonicalRequest,
    recommendation: canonicalResult
  })
  assert.equal(runId.runId, 501)
  assert.deepEqual(runId.candidates.map((candidate) => candidate.candidateId), [700])
  const runInsert = calls.find((call) => /INSERT INTO recommendation_runs/i.test(call.sql))
  assert.equal(runInsert.params[5], null)
  assert.equal(runInsert.params[7], null)
  assert.equal(runInsert.params[8], null)
  assert.equal(runInsert.params[9], null)
  assert.equal(runInsert.params[10], null)
  assert.equal(runInsert.params[6], 80)
  assert.deepEqual(JSON.parse(runInsert.params[11]), canonicalRequest.structure)
  assert.deepEqual(JSON.parse(runInsert.params[12]), canonicalRequest.preferences)
  const itemInserts = calls.filter((call) => /INSERT INTO recommendation_candidate_items/i.test(call.sql))
  assert.deepEqual(itemInserts.map((call) => call.params.slice(1, 4)), [[11, 1, '荤菜'], [12, 2, '素菜'], [13, 3, '汤']])
})

test('persisted Candidate retrieval maps DB rows to canonical camelCase response and stable navigation metadata', async () => {
  const calls = []
  const connection = {
    async execute(sql) {
      calls.push(sql)
      if (/FROM recommendation_candidate_items/i.test(sql)) return [[
        { runId: 501, candidateId: 701, candidateRank: 2, maxPrepMinutes: 40, estimatedPrepMinutes: 55, totalScore: 81, scoreBreakdown: '{"preference":80}', reasonText: '第二组', slotNo: 1, recipeId: 11, title: '更新后的菜名', category: '荤菜', cookMinutes: 30, difficulty: 2, coverUrl: '/uploads/recipes/new.jpg', tags: JSON.stringify([{ id: 1, code: 'spicy', name: '辣', kind: 'system', status: 'active' }]), dishScore: 82, itemReason: '理由' }
      ]]
      if (/SELECT 1 FROM recommendation_candidates/i.test(sql)) return [[{ one: 1 }]]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
  const candidate = await loadPersistedCandidate({ connection, familyId: 1, runId: 501, rank: 2 })
  assert.equal(candidate.candidateId, 701)
  assert.equal(candidate.rank, 2)
  assert.equal(candidate.withinTimeLimit, false)
  assert.equal(candidate.timeOverageMinutes, 15)
  assert.match(candidate.timeWarning, /比你设定的 40 分钟多约 15 分钟/)
  assert.equal(candidate.nextCandidateAvailable, true)
  assert.deepEqual(candidate.items[0], { recipeId: 11, title: '更新后的菜名', category: '荤菜', cookMinutes: 30, difficulty: 2, coverUrl: '/uploads/recipes/new.jpg', tags: [{ id: 1, code: 'spicy', name: '辣', kind: 'system', status: 'active' }], dishScore: 82, reason: '理由' })
})

function makeCanonicalApplyConnection({ restrictionRows = [], category = '荤菜', cookMinutes = 20, existingRecipeIds = [] } = {}) {
  const state = { menus: 0, menuItems: existingRecipeIds.map((recipeId, index) => ({ recipeId, itemId: index + 1, note: '原备注' })) }
  return {
    state,
    async execute(sql, params = []) {
      if (/FROM family_members WHERE/i.test(sql)) return [[{ id: 101 }]]
      if (/FROM recommendation_candidate_items/i.test(sql)) return [[
        { runId: 501, familyId: 1, menuDate: '2026-11-08', mealType: 'dinner', creatorId: 101, creatorFamilyId: 1, creatorStatus: 'active', maxPrepMinutes: 80, menuStructure: JSON.stringify({ meat: 1, vegetable: 1, soup: 1, staple: 0 }), candidateId: 701, candidateRank: 1, candidateItemCount: 3, slotNo: 1, recipeId: 11, itemCategory: category, dishScore: 82, itemReason: '理由', familyRecipeId: 11, recipeFamilyId: 1, recipeStatus: 'active', recipeCategory: category, cookMinutes },
        { runId: 501, familyId: 1, menuDate: '2026-11-08', mealType: 'dinner', creatorId: 101, creatorFamilyId: 1, creatorStatus: 'active', maxPrepMinutes: 80, menuStructure: JSON.stringify({ meat: 1, vegetable: 1, soup: 1, staple: 0 }), candidateId: 701, candidateRank: 1, candidateItemCount: 3, slotNo: 2, recipeId: 12, itemCategory: '素菜', dishScore: 70, itemReason: '理由', familyRecipeId: 12, recipeFamilyId: 1, recipeStatus: 'active', recipeCategory: '素菜', cookMinutes: 10 },
        { runId: 501, familyId: 1, menuDate: '2026-11-08', mealType: 'dinner', creatorId: 101, creatorFamilyId: 1, creatorStatus: 'active', maxPrepMinutes: 80, menuStructure: JSON.stringify({ meat: 1, vegetable: 1, soup: 1, staple: 0 }), candidateId: 701, candidateRank: 1, candidateItemCount: 3, slotNo: 3, recipeId: 13, itemCategory: '汤', dishScore: 75, itemReason: '理由', familyRecipeId: 13, recipeFamilyId: 1, recipeStatus: 'active', recipeCategory: '汤', cookMinutes: 30 }
      ]]
      if (/member_ingredient_restrictions/i.test(sql)) return [restrictionRows]
      if (/INSERT INTO menus/i.test(sql)) { state.menus += 1; return [{ insertId: 77 }] }
      if (/SELECT id, note FROM menu_items/i.test(sql)) {
        const found = state.menuItems.find((item) => item.recipeId === Number(params[1]))
        return [found ? [{ id: found.itemId, note: found.note }] : []]
      }
      if (/INSERT INTO menu_items/i.test(sql)) {
        state.menuItems.push({ recipeId: Number(params[1]), itemId: state.menuItems.length + 1, note: params[3] })
        return [{ insertId: state.menuItems.at(-1).itemId }]
      }
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
}

test('canonical Apply revalidates structure and restriction before creating MenuItems and allows time drift', async () => {
  const connection = makeCanonicalApplyConnection({ cookMinutes: 100 })
  const result = await applyCanonicalRecommendationRun({ connection, familyId: 1, memberId: 101, runId: 501, candidateId: 701 })
  assert.equal(result.menuId, 77)
  assert.equal(result.addedCount, 3)
  assert.equal(result.alreadyPresentCount, 0)
  assert.equal(result.currentWithinTimeLimit, false)
  assert.equal(result.currentTimeOverageMinutes, 40)
  assert.equal(connection.state.menus, 1)
})

test('canonical Apply rejects newly added restrictions without writing a Menu', async () => {
  const connection = makeCanonicalApplyConnection({ restrictionRows: [{ recipeId: 12, ingredientId: 99 }] })
  await assert.rejects(
    applyCanonicalRecommendationRun({ connection, familyId: 1, memberId: 101, runId: 501, candidateId: 701 }),
    (error) => error.status === 409
  )
  assert.equal(connection.state.menus, 0)
  assert.equal(connection.state.menuItems.length, 0)
})

test('canonical Apply rejects a changed Recipe category as stale without partial writes', async () => {
  const connection = makeCanonicalApplyConnection({ category: '素菜' })
  await assert.rejects(
    applyCanonicalRecommendationRun({ connection, familyId: 1, memberId: 101, runId: 501, candidateId: 701 }),
    (error) => error.status === 409
  )
  assert.equal(connection.state.menus, 0)
  assert.equal(connection.state.menuItems.length, 0)
})

function makeCanonicalRouteDatabase({ failOnCandidate = false, failOnCandidateItem = false, preferenceTagRows = [] } = {}) {
  const calls = []
  let candidateId = 700
  const connection = {
    async beginTransaction() { calls.push({ type: 'begin' }) },
    async commit() { calls.push({ type: 'commit' }) },
    async rollback() { calls.push({ type: 'rollback' }) },
    release() { calls.push({ type: 'release' }) },
    async execute(sql, params = []) {
      calls.push({ sql, params })
      if (/FROM recipes r/i.test(sql) && /WHERE r\.family_id/i.test(sql)) return [[
        { id: 11, familyId: 1, status: 'active', title: '荤菜候选', category: '荤菜', cookMinutes: 20, difficulty: 1, servings: 3 },
        { id: 12, familyId: 1, status: 'active', title: '素菜候选', category: '素菜', cookMinutes: 10, difficulty: 1, servings: 3 },
        { id: 13, familyId: 1, status: 'active', title: '汤候选', category: '汤', cookMinutes: 30, difficulty: 1, servings: 3 }
      ]]
      if (/FROM recipe_ingredients ri/i.test(sql)) return [[
        { recipeId: 11, ingredientId: 1, amountGrams: 100, ingredientName: '猪肉', caloriesPer100g: 100, proteinPer100g: 20, fatPer100g: 10, carbohydratePer100g: 0 },
        { recipeId: 12, ingredientId: 2, amountGrams: 100, ingredientName: '青菜', caloriesPer100g: 30, proteinPer100g: 2, fatPer100g: 0, carbohydratePer100g: 4 },
        { recipeId: 13, ingredientId: 3, amountGrams: 100, ingredientName: '冬瓜', caloriesPer100g: 20, proteinPer100g: 1, fatPer100g: 0, carbohydratePer100g: 3 }
      ]]
      if (/FROM tag_definitions/i.test(sql)) return [preferenceTagRows]
      if (/FROM recipe_tags/i.test(sql)) return [preferenceTagRows.map((row) => ({ ...row, recipeId: row.recipeId || 11, tagId: row.tagId || row.id, tagCode: row.tagCode || 'custom', tagName: row.tagName || '家庭标签', tagKind: row.tagKind || 'custom' }))]
      if (/FROM ingredient_seasons/i.test(sql)) return [[]]
      if (/member_ingredient_restrictions/i.test(sql)) return [[]]
      if (/member_category_preferences/i.test(sql)) return [[{ memberId: 101, category: null, preferenceScore: null }]]
      if (/FROM menus m/i.test(sql)) return [[]]
      if (/FROM family_members WHERE/i.test(sql)) return [[{ id: 101 }]]
      if (/SELECT id FROM recipes WHERE/i.test(sql)) return [[{ id: 11 }, { id: 12 }, { id: 13 }]]
      if (/INSERT INTO recommendation_runs/i.test(sql)) return [{ insertId: 501 }]
      if (/INSERT INTO recommendation_candidates/i.test(sql)) {
        if (failOnCandidate) throw new Error('candidate insert failed')
        return [{ insertId: candidateId++ }]
      }
      if (/INSERT INTO recommendation_candidate_items/i.test(sql)) {
        if (failOnCandidateItem) throw new Error('candidate item insert failed')
        return [{ affectedRows: 1 }]
      }
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
  return { calls, connection, async execute(...args) { return connection.execute(...args) }, async getConnection() { return connection } }
}

test('canonical recommendation route uses R2, persists Candidates, and keeps legacy fields null', async () => {
  const database = makeCanonicalRouteDatabase()
  const app = express()
  app.use(express.json())
  app.use('/api', menuRouter({
    database,
    auth: (_request, _response, next) => next(),
    family: (request, _response, next) => { request.membership = { family_id: 1, member_id: 101 }; next() }
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, message: error.message }))
  const server = await new Promise((resolve) => { const instance = app.listen(0, () => resolve(instance)) })
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/recommendations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...canonicalRequest })
    })
    const responsePayload = await response.json()
    assert.equal(response.status, 201, JSON.stringify(responsePayload))
    const data = responsePayload.data
    assert.equal(data.runId, 501)
    assert.equal(data.candidates[0].candidateId, 700)
    assert.equal(data.candidates[0].items[0].cookMinutes, 20)
    const itemInsert = database.calls.find((call) => call.sql && /INSERT INTO recommendation_candidate_items/i.test(call.sql))
    assert.equal(data.candidates[0].items[0].dishScore, itemInsert.params[4])
    const runInsert = database.calls.find((call) => call.sql && /INSERT INTO recommendation_runs/i.test(call.sql))
    assert.equal(runInsert.params[5], null)
    assert.equal(runInsert.params[7], null)
    assert.equal(runInsert.params[8], null)
    assert.equal(runInsert.params[9], null)
    assert.equal(runInsert.params[10], null)
    assert.deepEqual(database.calls.filter((call) => call.type === 'commit').length, 1)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('canonical recommendation route validates tag identity and persists normalized tag preferences', async () => {
  const database = makeCanonicalRouteDatabase({ preferenceTagRows: [{ id: 101, familyId: 1, kind: 'custom', status: 'active', recipeId: 11 }] })
  const app = express()
  app.use(express.json())
  app.use('/api', menuRouter({
    database,
    auth: (_request, _response, next) => next(),
    family: (request, _response, next) => { request.membership = { family_id: 1, member_id: 101 }; next() }
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, message: error.message }))
  const server = await new Promise((resolve) => { const instance = app.listen(0, () => resolve(instance)) })
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/recommendations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...canonicalRequest, preferences: { selectedTagIds: [101, 101] } })
    })
    const payload = await response.json()
    assert.equal(response.status, 201, JSON.stringify(payload))
    const runInsert = database.calls.find((call) => call.sql && /INSERT INTO recommendation_runs/i.test(call.sql))
    assert.deepEqual(JSON.parse(runInsert.params[12]), { selectedTagIds: [101] })
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('canonical and legacy recommendation fields cannot be mixed', async () => {
  const database = makeCanonicalRouteDatabase()
  const app = express()
  app.use(express.json())
  app.use('/api', menuRouter({
    database,
    auth: (_request, _response, next) => next(),
    family: (request, _response, next) => { request.membership = { family_id: 1, member_id: 101 }; next() }
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, message: error.message }))
  const server = await new Promise((resolve) => { const instance = app.listen(0, () => resolve(instance)) })
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/recommendations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...canonicalRequest, maxCookMinutes: 90 })
    })
    assert.equal(response.status, 400)
    assert.equal(database.calls.some((call) => call.type === 'begin'), false)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('canonical persistence rolls back when a Candidate Item insert fails', async () => {
  const database = makeCanonicalRouteDatabase({ failOnCandidateItem: true })
  const app = express()
  app.use(express.json())
  app.use('/api', menuRouter({
    database,
    auth: (_request, _response, next) => next(),
    family: (request, _response, next) => { request.membership = { family_id: 1, member_id: 101 }; next() }
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, message: '服务器发生错误' }))
  const server = await new Promise((resolve) => { const instance = app.listen(0, () => resolve(instance)) })
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/recommendations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...canonicalRequest })
    })
    assert.equal(response.status, 500)
    assert.equal(database.calls.filter((call) => call.type === 'commit').length, 0)
    assert.equal(database.calls.filter((call) => call.type === 'rollback').length, 1)
    assert.equal(database.calls.filter((call) => call.type === 'release').length, 1)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('canonical persistence rolls back when a Candidate insert fails after Run creation', async () => {
  const database = makeCanonicalRouteDatabase({ failOnCandidate: true })
  const app = express()
  app.use(express.json())
  app.use('/api', menuRouter({
    database,
    auth: (_request, _response, next) => next(),
    family: (request, _response, next) => { request.membership = { family_id: 1, member_id: 101 }; next() }
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, message: '服务器发生错误' }))
  const server = await new Promise((resolve) => { const instance = app.listen(0, () => resolve(instance)) })
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/recommendations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...canonicalRequest })
    })
    assert.equal(response.status, 500)
    assert.equal(database.calls.filter((call) => call.type === 'commit').length, 0)
    assert.equal(database.calls.filter((call) => call.type === 'rollback').length, 1)
    assert.equal(database.calls.filter((call) => call.type === 'release').length, 1)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('apply request classification uses persisted Run state and rejects wrong body contracts', async () => {
  const canonicalConnection = {
    async execute(sql) {
      if (/EXISTS \(SELECT 1 FROM recommendation_candidates/i.test(sql)) return [[{ id: 501, maxPrepMinutes: 80, menuStructure: '{}', sessionPreferences: '{}', hasCandidates: 1 }]]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
  await assert.rejects(
    applyRecommendationRequest({ connection: canonicalConnection, familyId: 1, memberId: 101, runId: 501, body: {} }),
    (error) => error.status === 400
  )

  const legacyConnection = {
    async execute(sql) {
      if (/EXISTS \(SELECT 1 FROM recommendation_candidates/i.test(sql)) return [[{ id: 502, maxPrepMinutes: null, menuStructure: null, sessionPreferences: null, hasCandidates: 0 }]]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
  await assert.rejects(
    applyRecommendationRequest({ connection: legacyConnection, familyId: 1, memberId: 101, runId: 502, body: { candidateId: 701 } }),
    (error) => error.status === 400
  )
})

test('canonical Apply route accepts only the persisted candidateId and commits menu changes', async () => {
  const connection = makeCanonicalApplyConnection({ cookMinutes: 100 })
  const originalExecute = connection.execute.bind(connection)
  const calls = []
  connection.beginTransaction = async () => { calls.push('begin') }
  connection.commit = async () => { calls.push('commit') }
  connection.rollback = async () => { calls.push('rollback') }
  connection.release = () => { calls.push('release') }
  connection.execute = async (sql, params = []) => {
    if (/EXISTS \(SELECT 1 FROM recommendation_candidates/i.test(sql)) return [[{ id: 501, maxPrepMinutes: 80, menuStructure: JSON.stringify({ meat: 1, vegetable: 1, soup: 1, staple: 0 }), sessionPreferences: '{}', hasCandidates: 1 }]]
    return originalExecute(sql, params)
  }
  const database = { getConnection: async () => connection }
  const app = express()
  app.use(express.json())
  app.use('/api', menuRouter({
    database,
    auth: (_request, _response, next) => next(),
    family: (request, _response, next) => { request.membership = { family_id: 1, member_id: 101 }; next() }
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, message: error.message }))
  const server = await new Promise((resolve) => { const instance = app.listen(0, () => resolve(instance)) })
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/recommendations/501/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ candidateId: 701 })
    })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).data.candidateId, 701)
    assert.deepEqual(calls, ['begin', 'commit', 'release'])
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('candidate retrieval route returns the persisted rank without regenerating', async () => {
  const database = {
    async execute(sql) {
      if (/FROM recommendation_candidate_items/i.test(sql)) return [[{ runId: 501, candidateId: 701, candidateRank: 2, maxPrepMinutes: 40, estimatedPrepMinutes: 35, totalScore: 80, scoreBreakdown: '{}', reasonText: '已保存', slotNo: 1, recipeId: 11, title: '荤菜', category: '荤菜', cookMinutes: 20, coverUrl: '/uploads/recipes/a.jpg', dishScore: 80, itemReason: '匹配' }]]
      if (/SELECT 1 FROM recommendation_candidates/i.test(sql)) return [[]]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
  const app = express()
  app.use('/api', menuRouter({
    database,
    auth: (_request, _response, next) => next(),
    family: (request, _response, next) => { request.membership = { family_id: 1, member_id: 101 }; next() }
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, message: error.message }))
  const server = await new Promise((resolve) => { const instance = app.listen(0, () => resolve(instance)) })
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/recommendations/501/candidates/2`)
    const payload = await response.json()
    assert.equal(response.status, 200, JSON.stringify(payload))
    const data = payload.data
    assert.equal(data.candidateId, 701)
    assert.equal(data.rank, 2)
    assert.equal(data.nextCandidateAvailable, false)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
