const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { router: tagRouter } = require('../src/routes/tags')

const ownerMembership = { family_id: 1, member_id: 101, role: 'admin' }
const memberMembership = { family_id: 1, member_id: 102, role: 'member' }

const SYSTEM_TAGS = [
  ['spicy', '辣'], ['sour', '酸'], ['sweet', '甜'], ['seafood', '海鲜'], ['fish', '鱼'],
  ['shrimp', '虾'], ['crab', '蟹'], ['bake', '烤'], ['steam', '蒸'], ['fried', '炸']
]

function makeDatabase() {
  const tagDefinitions = SYSTEM_TAGS.map(([code, name], index) => ({
    id: index + 1, family_id: null, kind: 'system', code, name, normalized_name: name,
    status: 'active', created_by_member_id: null, created_at: index
  })).concat([
    { id: 20, family_id: 1, kind: 'custom', code: null, name: '家常', normalized_name: '家常', status: 'active', created_by_member_id: 102, created_at: 20 },
    { id: 21, family_id: 1, kind: 'custom', code: null, name: '旧标签', normalized_name: '旧标签', status: 'inactive', created_by_member_id: 102, created_at: 21 },
    { id: 30, family_id: 2, kind: 'custom', code: null, name: '家庭 B 标签', normalized_name: '家庭 B 标签', status: 'active', created_by_member_id: 201, created_at: 30 }
  ])
  let nextId = 31
  const calls = []
  return {
    tagDefinitions,
    calls,
    async execute(sql, params = []) {
      calls.push({ sql, params })
      if (/FROM tag_definitions/i.test(sql) && /ORDER BY/i.test(sql)) {
        const includeInactive = !/status\s*=\s*'active'/i.test(sql)
        const rows = tagDefinitions.filter((tag) =>
          (tag.kind === 'system' && tag.status === 'active') ||
          (tag.family_id === Number(params[0]) && (includeInactive || tag.status === 'active'))
        ).map((tag) => ({
          id: tag.id, familyId: tag.family_id, kind: tag.kind, code: tag.code,
          name: tag.name, normalizedName: tag.normalized_name, status: tag.status,
          createdByMemberId: tag.created_by_member_id
        }))
        return [rows]
      }
      if (/SELECT id, family_id AS familyId, kind, code, name, normalized_name AS normalizedName, created_by_member_id AS createdByMemberId FROM tag_definitions WHERE id = \?/i.test(sql)) {
        const tag = tagDefinitions.find((item) => item.id === Number(params[0]))
        return [tag ? [{ id: tag.id, familyId: tag.family_id, kind: tag.kind, code: tag.code, name: tag.name, normalizedName: tag.normalized_name, status: tag.status, createdByMemberId: tag.created_by_member_id }] : []]
      }
      if (/SELECT id FROM tag_definitions/i.test(sql) && /normalized_name/i.test(sql)) {
        const tag = tagDefinitions.find((item) => item.family_id === Number(params[0]) && item.normalized_name === params[1])
        return [tag ? [{ id: tag.id }] : []]
      }
      if (/INSERT INTO tag_definitions/i.test(sql)) {
        const [familyId, name, normalizedName, memberId] = params
        const duplicate = tagDefinitions.find((item) => item.family_id === Number(familyId) && item.normalized_name === normalizedName)
        if (duplicate) { const error = new Error('duplicate'); error.code = 'ER_DUP_ENTRY'; throw error }
        const tag = { id: nextId++, family_id: familyId, kind: 'custom', code: null, name, normalized_name: normalizedName, status: 'active', created_by_member_id: memberId, created_at: nextId }
        tagDefinitions.push(tag)
        return [{ insertId: tag.id }]
      }
      if (/UPDATE tag_definitions SET name =/i.test(sql)) {
        const [name, normalizedName, id] = params
        const tag = tagDefinitions.find((item) => item.id === Number(id))
        if (tag) { tag.name = name; tag.normalized_name = normalizedName }
        return [{ affectedRows: tag ? 1 : 0 }]
      }
      if (/DELETE FROM recipe_tags WHERE tag_id = \?/i.test(sql)) {
        return [{ affectedRows: 0 }]
      }
      if (/DELETE FROM tag_definitions WHERE id = \?/i.test(sql)) {
        const index = tagDefinitions.findIndex((item) => item.id === Number(params[0]))
        if (index < 0) return [{ affectedRows: 0 }]
        tagDefinitions.splice(index, 1)
        return [{ affectedRows: 1 }]
      }
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
}

function makeApp(database, membership = ownerMembership) {
  const app = express()
  app.use(express.json())
  app.use('/api', tagRouter({
    database,
    auth: (request, _response, next) => { request.user = { id: 7 }; next() },
    family: (request, _response, next) => { request.membership = membership; next() }
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, message: error.message }))
  return app
}

async function withServer(app, callback) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance))
  })
  try { return await callback(`http://127.0.0.1:${server.address().port}`) } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('GET tags returns the fixed active system order and current-family custom tags only', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/tags`)
    assert.equal(response.status, 200)
    const payload = await response.json()
    assert.deepEqual(payload.data.systemTags.map((tag) => tag.code), SYSTEM_TAGS.map(([code]) => code))
    assert.deepEqual(payload.data.customTags.map((tag) => tag.id), [20])
    assert.equal(JSON.stringify(payload), JSON.stringify(payload).replace('家庭 B 标签', '家庭 B 标签'))
  })
})

test('POST tag trims the name, derives family and creator, and rejects duplicate names', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database, memberMembership), async (baseUrl) => {
    let response = await fetch(`${baseUrl}/api/tags`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '  快手菜  ', family_id: 999, kind: 'system', created_by_member_id: 999 }) })
    assert.equal(response.status, 201)
    const created = database.tagDefinitions.find((tag) => tag.name === '快手菜')
    assert.deepEqual({ family_id: created.family_id, kind: created.kind, status: created.status, created_by_member_id: created.created_by_member_id }, { family_id: 1, kind: 'custom', status: 'active', created_by_member_id: 102 })
    response = await fetch(`${baseUrl}/api/tags`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '旧标签' }) })
    assert.equal(response.status, 409)
  })
})

test('PUT and DELETE enforce custom-tag ownership, system immutability, family boundary, and hard delete', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database, { ...memberMembership, member_id: 103 }), async (baseUrl) => {
    let response = await fetch(`${baseUrl}/api/tags/20`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '新名称' }) })
    assert.equal(response.status, 403)
    response = await fetch(`${baseUrl}/api/tags/1`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '不能改' }) })
    assert.equal(response.status, 403)
    response = await fetch(`${baseUrl}/api/tags/30`, { method: 'DELETE' })
    assert.equal(response.status, 404)
  })
  await withServer(makeApp(database, ownerMembership), async (baseUrl) => {
    let response = await fetch(`${baseUrl}/api/tags/20`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '新名称' }) })
    assert.equal(response.status, 200)
    response = await fetch(`${baseUrl}/api/tags/20`, { method: 'DELETE' })
    assert.equal(response.status, 200)
    response = await fetch(`${baseUrl}/api/tags/20`, { method: 'DELETE' })
    assert.equal(response.status, 404)
    assert.equal(database.tagDefinitions.some((tag) => tag.id === 20), false)
  })
})
