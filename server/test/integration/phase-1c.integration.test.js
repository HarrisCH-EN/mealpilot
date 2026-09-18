const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const mysql = require('mysql2/promise')
const { createToken } = require('../../src/auth')
const { createDatabase } = require('../../src/db')
const { getConfig } = require('../../src/config')
const { createApp } = require('../../src/app')
const { addMenuItem } = require('../../src/services/menu-item-service')
const starterRecipes = require('../../src/data/starter-recipes')

const config = getConfig()
const testDatabase = process.env.MYSQL_TEST_DATABASE
const businessDatabase = config.mysql.database
const writesOptedIn = process.env.PHASE_1C_ALLOW_DB_WRITES === '1'

if (testDatabase && testDatabase === businessDatabase) throw new Error('安全终止：MYSQL_TEST_DATABASE 不能等于业务数据库')
if (testDatabase && !/test/i.test(testDatabase)) throw new Error('安全终止：测试数据库名称必须包含 test')

const safeDatabaseConfigured = Boolean(testDatabase && testDatabase !== businessDatabase && writesOptedIn)
const skipReason = !testDatabase ? 'MYSQL_TEST_DATABASE 未配置' : !writesOptedIn ? 'PHASE_1C_ALLOW_DB_WRITES 未显式启用' : '测试数据库安全配置不满足要求'

let database
let server
let baseUrl
let fixture
const jwtSecret = 'phase-1c-integration-secret'
const integrationStorage = {
  async uploadBuffer({ cloudPath }) { return { fileId: `cloud://test.bucket/${cloudPath}` } },
  async getTemporaryUrl(fileId) { return `https://temp.test/${encodeURIComponent(fileId)}` },
  async getTemporaryUrls(fileIds) { return Object.fromEntries(fileIds.map((fileId) => [fileId, `https://temp.test/${encodeURIComponent(fileId)}`])) },
  async deleteFile() {}
}

function integrationTest(name, fn) {
  test(name, { skip: safeDatabaseConfigured ? false : skipReason }, fn)
}

async function queryOne(sql, params = []) {
  const [rows] = await database.execute(sql, params)
  return rows[0] || null
}

async function queryRows(sql, params = []) {
  const [rows] = await database.execute(sql, params)
  return rows
}

function parseJsonValue(value) {
  return typeof value === 'string' ? JSON.parse(value) : value
}

async function insertUser(connection, openid, displayName) {
  const [result] = await connection.execute('INSERT INTO users (openid, display_name) VALUES (?, ?)', [openid, displayName])
  return result.insertId
}

async function insertFamily(connection, name, inviteCode, ownerUserId) {
  const [result] = await connection.execute('INSERT INTO families (name, invite_code, owner_user_id) VALUES (?, ?, ?)', [name, inviteCode, ownerUserId])
  return result.insertId
}

async function insertMember(connection, familyId, userId, role = 'member') {
  const [result] = await connection.execute('INSERT INTO family_members (family_id, user_id, role, nickname) VALUES (?, ?, ?, ?)', [familyId, userId, role, `成员${userId}`])
  return result.insertId
}

async function insertIngredient(connection, name) {
  const [result] = await connection.execute('INSERT INTO ingredients (name) VALUES (?)', [name])
  return result.insertId
}

async function seedSystemTags(connection) {
  const tags = [
    ['spicy', '辣'], ['sour', '酸'], ['sweet', '甜'], ['seafood', '海鲜'], ['fish', '鱼'],
    ['shrimp', '虾'], ['crab', '蟹'], ['bake', '烤'], ['steam', '蒸'], ['fried', '炸']
  ]
  for (const [code, name] of tags) {
    await connection.execute(
      `INSERT INTO tag_definitions (kind, code, name, normalized_name, status)
       VALUES ('system', ?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE name = VALUES(name), normalized_name = VALUES(normalized_name), status = 'active'`,
      [code, name, name]
    )
  }
}


async function seedStarterIngredients() {
  const seedSql = await fs.readFile(path.join(__dirname, '../../../database/02_seed.sql'), 'utf8')
  const start = seedSql.indexOf('INSERT INTO ingredients')
  const end = seedSql.indexOf('\n\nINSERT INTO ingredient_seasons', start)
  if (start < 0 || end < 0) throw new Error('无法从 02_seed.sql 提取 Ingredient Seed')
  const connection = await database.getConnection()
  try {
    await connection.execute('ALTER TABLE ingredients AUTO_INCREMENT = 1')
    await connection.query(seedSql.slice(start, end).trim())
  } finally {
    connection.release()
  }
}
async function insertRecipe(connection, { familyId, memberId, title, category, cookMinutes = 20, ingredientIds, status = 'active' }) {
  const [result] = await connection.execute(
    `INSERT INTO recipes (family_id, created_by_member_id, title, category, description, steps, cook_minutes, difficulty, servings, status)
     VALUES (?, ?, ?, ?, '集成测试', '测试步骤', ?, 2, 2, ?)`,
    [familyId, memberId, title, category, cookMinutes, status]
  )
  for (const ingredientId of ingredientIds) await connection.execute('INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount_grams) VALUES (?, ?, 100)', [result.insertId, ingredientId])
  return result.insertId
}

async function insertMenu(connection, { familyId, memberId, date = '2026-09-08', mealType = 'dinner', runId = null }) {
  const [result] = await connection.execute('INSERT INTO menus (family_id, created_by_member_id, recommendation_run_id, menu_date, meal_type) VALUES (?, ?, ?, ?, ?)', [familyId, memberId, runId, date, mealType])
  return result.insertId
}

async function insertMenuItem(connection, menuId, recipeId, source = 'manual', note = '') {
  const [result] = await connection.execute('INSERT INTO menu_items (menu_id, recipe_id, source, note) VALUES (?, ?, ?, ?)', [menuId, recipeId, source, note])
  return result.insertId
}

async function insertRun(connection, { familyId, memberId, recipeIds, date = '2026-09-08', mealType = 'dinner' }) {
  const [result] = await connection.execute(
    `INSERT INTO recommendation_runs (family_id, created_by_member_id, menu_date, meal_type, people_count, max_cook_minutes, mode, total_score, total_cook_minutes, score_breakdown)
     VALUES (?, ?, ?, ?, 2, 90, 'balanced', 80, 30, '{}')`,
    [familyId, memberId, date, mealType]
  )
  for (const recipeId of recipeIds) await connection.execute('INSERT INTO recommendation_items (recommendation_run_id, recipe_id, dish_score, reason_text) VALUES (?, ?, 80, ?)', [result.insertId, recipeId, '集成测试推荐'])
  return result.insertId
}

async function cleanup() {
  if (!database) return
  const connection = await database.getConnection()
  try {
    for (const table of ['menu_feedback', 'menu_items', 'menus', 'recommendation_candidate_items', 'recommendation_candidates', 'recommendation_items', 'recommendation_runs', 'recipe_tags', 'recipe_ingredients', 'member_ingredient_restrictions', 'member_category_preferences', 'recipes']) await connection.execute(`DELETE FROM ${table}`)
    await connection.execute("DELETE FROM tag_definitions WHERE kind = 'custom'")
    for (const table of ['family_members', 'families', 'ingredient_seasons', 'ingredients', 'users']) await connection.execute(`DELETE FROM ${table}`)
  } finally {
    connection.release()
  }
}

async function seedFixture() {
  const connection = await database.getConnection()
  try {
    const userA = await insertUser(connection, 'phase1c-user-a', '家庭 A 用户')
    const userB = await insertUser(connection, 'phase1c-user-b', '家庭 B 用户')
    const joinUser = await insertUser(connection, 'phase1c-join-user', '并发加入用户')
    const ownerC = await insertUser(connection, 'phase1c-owner-c', '家庭 C 主人')
    const ownerD = await insertUser(connection, 'phase1c-owner-d', '家庭 D 主人')
    const memberA2User = await insertUser(connection, 'phase1c-member-a2', '家庭 A 成员二')
    const memberA3User = await insertUser(connection, 'phase1c-member-a3', '家庭 A 成员三')

    const familyA = await insertFamily(connection, '集成家庭 A', 'P1CAAA', userA)
    const familyB = await insertFamily(connection, '集成家庭 B', 'P1CBBB', userB)
    const familyC = await insertFamily(connection, '集成家庭 C', 'P1CCCC', ownerC)
    const familyD = await insertFamily(connection, '集成家庭 D', 'P1CDDD', ownerD)

    const memberA = await insertMember(connection, familyA, userA, 'owner')
    const memberB = await insertMember(connection, familyB, userB, 'owner')
    const memberC = await insertMember(connection, familyC, ownerC, 'owner')
    const memberD = await insertMember(connection, familyD, ownerD, 'owner')
    const memberA2 = await insertMember(connection, familyA, memberA2User)
    const memberA3 = await insertMember(connection, familyA, memberA3User)

    const ingredientX = await insertIngredient(connection, '集成食材 X')
    const ingredientY = await insertIngredient(connection, '集成食材 Y')
    const ingredientZ = await insertIngredient(connection, '集成食材 Z')
    const ingredientA = await insertIngredient(connection, '集成食材 A')
    const ingredientB = await insertIngredient(connection, '集成食材 B')

    const oldRecipe = await insertRecipe(connection, { familyId: familyA, memberId: memberA, title: 'Old Recipe', category: '荤菜', ingredientIds: [ingredientA, ingredientB] })
    const recipeX = await insertRecipe(connection, { familyId: familyA, memberId: memberA, title: 'Family A X', category: '荤菜', ingredientIds: [ingredientX] })
    const recipeY = await insertRecipe(connection, { familyId: familyA, memberId: memberA, title: 'Family A Y', category: '素菜', cookMinutes: 5, ingredientIds: [ingredientY] })
    const recipeZ = await insertRecipe(connection, { familyId: familyA, memberId: memberA, title: 'Family A Z', category: '汤', ingredientIds: [ingredientZ] })
    const safeMeat = await insertRecipe(connection, { familyId: familyA, memberId: memberA, title: 'Family A Safe Meat', category: '荤菜', ingredientIds: [ingredientZ] })
    const safeVegetable = await insertRecipe(connection, { familyId: familyA, memberId: memberA, title: 'Family A Safe Vegetable', category: '素菜', cookMinutes: 30, ingredientIds: [ingredientZ] })
    const recipeB = await insertRecipe(connection, { familyId: familyB, memberId: memberB, title: 'Family B Recipe', category: '荤菜', ingredientIds: [ingredientZ] })

    const menuA = await insertMenu(connection, { familyId: familyA, memberId: memberA })
    const menuB = await insertMenu(connection, { familyId: familyB, memberId: memberB })
    const menuBItem = await insertMenuItem(connection, menuB, recipeB, 'manual', 'B 菜单项')
    const runA = await insertRun(connection, { familyId: familyA, memberId: memberA, recipeIds: [recipeX, recipeY, recipeZ] })
    const runB = await insertRun(connection, { familyId: familyB, memberId: memberB, recipeIds: [recipeB] })

    return {
      users: { userA, userB, joinUser, ownerC, ownerD, memberA2User, memberA3User },
      families: { familyA, familyB, familyC, familyD },
      members: { memberA, memberB, memberC, memberD, memberA2, memberA3 },
      ingredients: { ingredientX, ingredientY, ingredientZ, ingredientA, ingredientB },
      recipes: { oldRecipe, recipeX, recipeY, recipeZ, safeMeat, safeVegetable, recipeB },
      menus: { menuA, menuB, menuBItem },
      runs: { runA, runB }
    }
  } finally {
    connection.release()
  }
}

function authHeaders(userId) {
  return { authorization: `Bearer ${createToken({ id: userId, openid: `phase1c-${userId}` }, jwtSecret)}` }
}

async function requestAs(userId, pathName, options = {}) {
  return fetch(`${baseUrl}${pathName}`, { ...options, headers: { ...authHeaders(userId), ...(options.headers || {}) } })
}

async function runMenuAdd(recipeId, date = '2026-09-09') {
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const result = await addMenuItem({ connection, familyId: fixture.families.familyA, memberId: fixture.members.memberA, menuDate: date, mealType: 'lunch', recipeId, note: `并发-${recipeId}` })
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

if (safeDatabaseConfigured) {
  test.before(async () => {
    const schema = await fs.readFile(path.join(__dirname, '../../../database/01_schema.sql'), 'utf8')
    const admin = await mysql.createConnection({ ...config.mysql, database: undefined, multipleStatements: true })
    try {
      await admin.query(`DROP DATABASE IF EXISTS \`${testDatabase}\``)
      await admin.query(`CREATE DATABASE \`${testDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
    } finally {
      await admin.end()
    }
    const schemaForTest = schema.replace(/CREATE DATABASE IF NOT EXISTS mealpilot[^;]*;\s*USE mealpilot\s*;/i, `USE \`${testDatabase}\`;`)
    const schemaConnection = await mysql.createConnection({ ...config.mysql, database: testDatabase, multipleStatements: true })
    try {
      await schemaConnection.query(schemaForTest)
    } finally {
      await schemaConnection.end()
    }
    database = createDatabase({ ...config.mysql, database: testDatabase })
    const tagConnection = await database.getConnection()
    try { await seedSystemTags(tagConnection) } finally { tagConnection.release() }
    fixture = await seedFixture()
    const app = createApp({ database, jwtSecret, devAuthEnabled: false, cloudStorageService: integrationStorage, cloudbaseStorageFileIdPrefix: 'cloud://test.bucket' })
    server = await new Promise((resolve) => { const instance = app.listen(0, () => resolve(instance)) })
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })
  test.beforeEach(async () => {
    await cleanup()
    fixture = await seedFixture()
  })
  test.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve))
    if (database) {
      await cleanup()
      await database.end()
      database = null
    }
  })
}

integrationTest('real schema constraints reject duplicates, invalid checks, and invalid foreign keys', async () => {
  const connection = await database.getConnection()
  try {
    await assert.rejects(connection.execute('INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount_grams) VALUES (?, ?, 100)', [fixture.recipes.oldRecipe, fixture.ingredients.ingredientA]), (error) => error.code === 'ER_DUP_ENTRY')
    await assert.rejects(connection.execute('INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount_grams) VALUES (?, ?, 0)', [fixture.recipes.oldRecipe, fixture.ingredients.ingredientZ]), (error) => error.errno === 3819 || error.code === 'ER_CHECK_CONSTRAINT_VIOLATED')
    await assert.rejects(connection.execute('INSERT INTO menus (family_id, created_by_member_id, menu_date, meal_type) VALUES (?, ?, ?, ?)', [fixture.families.familyA, fixture.members.memberA, '2026-09-08', 'dinner']), (error) => error.code === 'ER_DUP_ENTRY')
    await insertMenuItem(connection, fixture.menus.menuA, fixture.recipes.oldRecipe)
    await assert.rejects(connection.execute('INSERT INTO menu_items (menu_id, recipe_id) VALUES (?, ?)', [fixture.menus.menuA, fixture.recipes.oldRecipe]), (error) => error.code === 'ER_DUP_ENTRY')
    await assert.rejects(connection.execute('INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount_grams) VALUES (?, ?, 100)', [fixture.recipes.oldRecipe, 999999]), (error) => error.code === 'ER_NO_REFERENCED_ROW_2')
    await assert.rejects(connection.execute(`INSERT INTO recipes (family_id, created_by_member_id, title, category, description, steps, cook_minutes, difficulty, servings) VALUES (999999, ?, '非法家庭菜谱', '荤菜', 'x', 'x', 10, 1, 1)`, [fixture.members.memberA]), (error) => error.code === 'ER_NO_REFERENCED_ROW_2')
  } finally {
    connection.release()
  }
})

integrationTest('real Recipe create transaction rolls back the main row and earlier ingredient relation after a later failure', async () => {
  const response = await requestAs(fixture.users.userA, '/api/recipes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Should Roll Back', category: '荤菜', steps: '步骤', cookMinutes: 20, difficulty: 2, ingredients: [{ ingredientId: fixture.ingredients.ingredientA, amountGrams: 100 }, { ingredientId: fixture.ingredients.ingredientB, amountGrams: 100, note: 'x'.repeat(81) }] }) })
  assert.equal(response.status, 500)
  assert.equal(await queryOne('SELECT id FROM recipes WHERE family_id = ? AND title = ?', [fixture.families.familyA, 'Should Roll Back']), null)
  assert.equal((await queryRows('SELECT ri.recipe_id FROM recipe_ingredients ri JOIN recipes r ON r.id = ri.recipe_id WHERE r.title = ?', ['Should Roll Back'])).length, 0)
})

integrationTest('real Recipe edit transaction restores old title and relations after a later failure', async () => {
  const response = await requestAs(fixture.users.userA, `/api/recipes/${fixture.recipes.oldRecipe}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'New Recipe', category: '荤菜', steps: '新步骤', cookMinutes: 25, difficulty: 3, ingredients: [{ ingredientId: fixture.ingredients.ingredientZ, amountGrams: 80 }, { ingredientId: fixture.ingredients.ingredientB, amountGrams: 90, note: 'x'.repeat(81) }] }) })
  assert.equal(response.status, 500)
  assert.equal((await queryOne('SELECT title FROM recipes WHERE id = ?', [fixture.recipes.oldRecipe])).title, 'Old Recipe')
  assert.deepEqual((await queryRows('SELECT ingredient_id FROM recipe_ingredients WHERE recipe_id = ? ORDER BY ingredient_id', [fixture.recipes.oldRecipe])).map((row) => row.ingredient_id), [fixture.ingredients.ingredientA, fixture.ingredients.ingredientB])
})

integrationTest('real Menu concurrency creates one slot and one item for duplicate Recipe adds', async () => {
  const results = await Promise.all([runMenuAdd(fixture.recipes.recipeZ), runMenuAdd(fixture.recipes.recipeZ)])
  assert.deepEqual(results.map((result) => result.status).sort(), ['already-present', 'created'])
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM menus WHERE family_id = ? AND menu_date = ? AND meal_type = ?', [fixture.families.familyA, '2026-09-09', 'lunch'])).count, 1)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM menu_items mi JOIN menus m ON m.id = mi.menu_id WHERE m.family_id = ? AND m.menu_date = ? AND m.meal_type = ? AND mi.recipe_id = ?', [fixture.families.familyA, '2026-09-09', 'lunch', fixture.recipes.recipeZ])).count, 1)
})

integrationTest('real Menu concurrency reuses one slot for two different Recipes', async () => {
  const results = await Promise.all([runMenuAdd(fixture.recipes.recipeX), runMenuAdd(fixture.recipes.recipeY)])
  assert.deepEqual(results.map((result) => result.status).sort(), ['created', 'created'])
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM menus WHERE family_id = ? AND menu_date = ? AND meal_type = ?', [fixture.families.familyA, '2026-09-09', 'lunch'])).count, 1)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM menu_items mi JOIN menus m ON m.id = mi.menu_id WHERE m.family_id = ? AND m.menu_date = ? AND m.meal_type = ?', [fixture.families.familyA, '2026-09-09', 'lunch'])).count, 2)
})

integrationTest('real Recommendation Apply rolls back all Menu writes when one Recipe is deleted', async () => {
  await database.execute("UPDATE recipes SET status = 'deleted' WHERE id = ?", [fixture.recipes.recipeY])
  const response = await requestAs(fixture.users.userA, `/api/recommendations/${fixture.runs.runA}/apply`, { method: 'POST' })
  assert.equal(response.status, 409)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM menus WHERE family_id = ? AND menu_date = ? AND meal_type = ?', [fixture.families.familyA, '2026-09-08', 'dinner'])).count, 1)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM menu_items mi JOIN menus m ON m.id = mi.menu_id WHERE m.family_id = ? AND m.menu_date = ? AND m.meal_type = ?', [fixture.families.familyA, '2026-09-08', 'dinner'])).count, 0)
})

integrationTest('real Recommendation Apply is idempotent and preserves manual note/source', async () => {
  await insertMenuItem(database, fixture.menus.menuA, fixture.recipes.recipeX, 'manual', '手工备注')
  const first = await requestAs(fixture.users.userA, `/api/recommendations/${fixture.runs.runA}/apply`, { method: 'POST' })
  assert.equal(first.status, 200)
  assert.deepEqual((await first.json()).data, { menuId: fixture.menus.menuA, addedCount: 2, alreadyPresentCount: 1 })
  const second = await requestAs(fixture.users.userA, `/api/recommendations/${fixture.runs.runA}/apply`, { method: 'POST' })
  assert.equal(second.status, 200)
  assert.deepEqual((await second.json()).data, { menuId: fixture.menus.menuA, addedCount: 0, alreadyPresentCount: 3 })
  const rows = await queryRows('SELECT recipe_id, source, note FROM menu_items WHERE menu_id = ? ORDER BY recipe_id', [fixture.menus.menuA])
  assert.equal(rows.length, 3)
  assert.deepEqual(rows.find((row) => row.recipe_id === fixture.recipes.recipeX), { recipe_id: fixture.recipes.recipeX, source: 'manual', note: '手工备注' })
  assert.equal(rows.filter((row) => row.source === 'recommendation').length, 2)
})

integrationTest('real Recommendation Apply rejects a Run from another Family without writes', async () => {
  const before = await queryOne('SELECT COUNT(*) AS count FROM menus WHERE family_id = ?', [fixture.families.familyA])
  const response = await requestAs(fixture.users.userA, `/api/recommendations/${fixture.runs.runB}/apply`, { method: 'POST' })
  assert.equal(response.status, 404)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM menus WHERE family_id = ?', [fixture.families.familyA])).count, before.count)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM menu_items WHERE menu_id = ?', [fixture.menus.menuA])).count, 0)
})

integrationTest('real Family restriction recommendation uses active-member union and excludes left/other-Family restrictions', async () => {
  await database.execute('INSERT INTO member_ingredient_restrictions (member_id, ingredient_id) VALUES (?, ?), (?, ?), (?, ?)', [fixture.members.memberA2, fixture.ingredients.ingredientX, fixture.members.memberA3, fixture.ingredients.ingredientY, fixture.members.memberB, fixture.ingredients.ingredientZ])
  let response = await requestAs(fixture.users.userA, '/api/recommendations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ menuDate: '2026-09-10', mealType: 'dinner', peopleCount: 2, maxCookMinutes: 90, mode: 'balanced' }) })
  assert.equal(response.status, 200)
  let ids = (await response.json()).data.items.map((item) => item.id)
  assert.equal(ids.includes(fixture.recipes.recipeX), false)
  assert.equal(ids.includes(fixture.recipes.recipeY), false)
  assert.equal(ids.includes(fixture.recipes.recipeZ), true)
  await database.execute("UPDATE family_members SET status = 'left' WHERE id = ?", [fixture.members.memberA3])
  response = await requestAs(fixture.users.userA, '/api/recommendations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ menuDate: '2026-09-11', mealType: 'dinner', peopleCount: 2, maxCookMinutes: 90, mode: 'balanced' }) })
  assert.equal(response.status, 200)
  ids = (await response.json()).data.items.map((item) => item.id)
  assert.equal(ids.includes(fixture.recipes.recipeX), false)
  assert.equal(ids.includes(fixture.recipes.recipeY), true)
  assert.equal(ids.includes(fixture.recipes.recipeZ), true)
})

integrationTest('real Restriction Management API persists, scopes, and removes member restrictions', async () => {
  const add = await requestAs(fixture.users.userA, `/api/family-members/${fixture.members.memberA2}/restrictions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ingredientId: fixture.ingredients.ingredientX }) })
  assert.equal(add.status, 201)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM member_ingredient_restrictions WHERE member_id = ? AND ingredient_id = ?', [fixture.members.memberA2, fixture.ingredients.ingredientX])).count, 1)

  const ownerRead = await requestAs(fixture.users.userA, `/api/family-members/${fixture.members.memberA2}/restrictions`)
  assert.deepEqual((await ownerRead.json()).data, [{ ingredientId: fixture.ingredients.ingredientX, ingredientName: '集成食材 X' }])
  const memberRead = await requestAs(fixture.users.memberA2User, `/api/family-members/${fixture.members.memberA2}/restrictions`)
  assert.equal(memberRead.status, 200)
  const forbidden = await requestAs(fixture.users.memberA2User, `/api/family-members/${fixture.members.memberA3}/restrictions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ingredientId: fixture.ingredients.ingredientY }) })
  assert.equal(forbidden.status, 403)

  const duplicate = await requestAs(fixture.users.userA, `/api/family-members/${fixture.members.memberA2}/restrictions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ingredientId: fixture.ingredients.ingredientX }) })
  assert.equal(duplicate.status, 200)
  assert.equal((await duplicate.json()).data.status, 'already-present')

  const remove = await requestAs(fixture.users.userA, `/api/family-members/${fixture.members.memberA2}/restrictions/${fixture.ingredients.ingredientX}`, { method: 'DELETE' })
  assert.equal(remove.status, 200)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM member_ingredient_restrictions WHERE member_id = ? AND ingredient_id = ?', [fixture.members.memberA2, fixture.ingredients.ingredientX])).count, 0)
  assert.equal((await queryOne('SELECT id FROM ingredients WHERE id = ?', [fixture.ingredients.ingredientX])).id, fixture.ingredients.ingredientX)
})

integrationTest('real Restriction Management API rejects cross-Family and left Member mutations', async () => {
  const crossFamily = await requestAs(fixture.users.userA, `/api/family-members/${fixture.members.memberB}/restrictions`, { method: 'GET' })
  assert.equal(crossFamily.status, 404)
  const left = await requestAs(fixture.users.userA, `/api/family-members/${fixture.members.memberA3}/restrictions`, { method: 'GET' })
  assert.equal(left.status, 200)
  await database.execute("UPDATE family_members SET status = 'left' WHERE id = ?", [fixture.members.memberA3])
  const leftMutation = await requestAs(fixture.users.userA, `/api/family-members/${fixture.members.memberA3}/restrictions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ingredientId: fixture.ingredients.ingredientY }) })
  assert.equal(leftMutation.status, 404)
})

integrationTest('real Family restriction summary exposes only the active-member union', async () => {
  await database.execute('INSERT INTO member_ingredient_restrictions (member_id, ingredient_id) VALUES (?, ?), (?, ?), (?, ?)', [fixture.members.memberA2, fixture.ingredients.ingredientX, fixture.members.memberA3, fixture.ingredients.ingredientY, fixture.members.memberB, fixture.ingredients.ingredientZ])
  let response = await requestAs(fixture.users.userA, '/api/families/current/restrictions')
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).data.map((item) => item.ingredientId), [fixture.ingredients.ingredientX, fixture.ingredients.ingredientY])
  await database.execute("UPDATE family_members SET status = 'left' WHERE id = ?", [fixture.members.memberA3])
  response = await requestAs(fixture.users.userA, '/api/families/current/restrictions')
  assert.deepEqual((await response.json()).data.map((item) => item.ingredientId), [fixture.ingredients.ingredientX])
})

integrationTest('real Recommendation reads a newly added restriction and stops after removal', async () => {
  for (const ingredientId of [fixture.ingredients.ingredientX, fixture.ingredients.ingredientA]) {
    const add = await requestAs(fixture.users.userA, `/api/family-members/${fixture.members.memberA2}/restrictions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ingredientId }) })
    assert.equal(add.status, 201)
  }
  let response = await requestAs(fixture.users.userA, '/api/recommendations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ menuDate: '2026-09-15', mealType: 'dinner', peopleCount: 2, maxCookMinutes: 90, mode: 'balanced' }) })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).data.items.some((item) => item.id === fixture.recipes.recipeX), false)

  const remove = await requestAs(fixture.users.userA, `/api/family-members/${fixture.members.memberA2}/restrictions/${fixture.ingredients.ingredientX}`, { method: 'DELETE' })
  assert.equal(remove.status, 200)
  response = await requestAs(fixture.users.userA, '/api/recommendations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ menuDate: '2026-09-16', mealType: 'dinner', peopleCount: 2, maxCookMinutes: 90, mode: 'balanced' }) })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).data.items.some((item) => item.id === fixture.recipes.recipeX), true)
})

integrationTest('real Family isolation blocks cross-Family Recipe/MenuItem/Run access and hides dirty joins', async () => {
  const recipeBody = { title: '不应修改', category: '荤菜', steps: '步骤', cookMinutes: 20, difficulty: 2, ingredients: [{ ingredientId: fixture.ingredients.ingredientA, amountGrams: 100 }] }
  for (const [method, pathName, options] of [['GET', `/api/recipes/${fixture.recipes.recipeB}`], ['PUT', `/api/recipes/${fixture.recipes.recipeB}`, { headers: { 'content-type': 'application/json' }, body: JSON.stringify(recipeBody) }], ['DELETE', `/api/recipes/${fixture.recipes.recipeB}`]]) assert.equal((await requestAs(fixture.users.userA, pathName, { method, ...options })).status, 404)
  assert.equal((await queryOne('SELECT status, title FROM recipes WHERE id = ?', [fixture.recipes.recipeB])).status, 'active')
  const addResponse = await requestAs(fixture.users.userA, '/api/menus/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ menuDate: '2026-09-12', mealType: 'lunch', recipeId: fixture.recipes.recipeB }) })
  assert.equal(addResponse.status, 404)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM menu_items WHERE recipe_id = ?', [fixture.recipes.recipeB])).count, 1)
  const deleteResponse = await requestAs(fixture.users.userA, `/api/menus/items/${fixture.menus.menuBItem}`, { method: 'DELETE' })
  assert.equal(deleteResponse.status, 404)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM menu_items WHERE id = ?', [fixture.menus.menuBItem])).count, 1)
  assert.equal((await requestAs(fixture.users.userA, `/api/recommendations/${fixture.runs.runB}/apply`, { method: 'POST' })).status, 404)
  await insertMenuItem(database, fixture.menus.menuA, fixture.recipes.recipeB, 'manual', '脏关系')
  const menuData = await (await requestAs(fixture.users.userA, '/api/menus?date=2026-09-08')).json()
  assert.equal(JSON.stringify(menuData).includes('Family B Recipe'), false)
  assert.equal(JSON.stringify(menuData).includes(String(fixture.recipes.recipeB)), false)
  const insights = await (await requestAs(fixture.users.userA, '/api/insights')).json()
  assert.equal(insights.data.popular.some((item) => item.id === fixture.recipes.recipeB), false)
})

integrationTest('real Dynamic Reference shows edited Recipe data and keeps deleted historical MenuItem', async () => {
  const addResponse = await requestAs(fixture.users.userA, '/api/menus/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ menuDate: '2026-09-13', mealType: 'lunch', recipeId: fixture.recipes.oldRecipe, note: '历史备注' }) })
  assert.equal(addResponse.status, 201)
  const editResponse = await requestAs(fixture.users.userA, `/api/recipes/${fixture.recipes.oldRecipe}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'New Title', category: '荤菜', steps: '新步骤', cookMinutes: 25, difficulty: 2, ingredients: [{ ingredientId: fixture.ingredients.ingredientA, amountGrams: 100 }, { ingredientId: fixture.ingredients.ingredientB, amountGrams: 100 }] }) })
  assert.equal(editResponse.status, 200)
  const menuData = await (await requestAs(fixture.users.userA, '/api/menus?date=2026-09-13')).json()
  assert.equal(menuData.data[0].items[0].title, 'New Title')
  assert.equal((await requestAs(fixture.users.userA, `/api/recipes/${fixture.recipes.oldRecipe}`, { method: 'DELETE' })).status, 200)
  const historical = await (await requestAs(fixture.users.userA, '/api/menus?date=2026-09-13')).json()
  assert.equal(historical.data[0].items[0].title, 'New Title')
  assert.equal((await requestAs(fixture.users.userA, '/api/menus/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ menuDate: '2026-09-14', mealType: 'lunch', recipeId: fixture.recipes.oldRecipe }) })).status, 404)
  const recommendation = await requestAs(fixture.users.userA, '/api/recommendations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ menuDate: '2026-09-14', mealType: 'dinner', peopleCount: 2, maxCookMinutes: 90, mode: 'balanced' }) })
  assert.equal(recommendation.status, 200)
  assert.equal((await recommendation.json()).data.items.some((item) => item.id === fixture.recipes.oldRecipe), false)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM menu_items WHERE recipe_id = ?', [fixture.recipes.oldRecipe])).count, 1)
})

integrationTest('R5.2 canonical Generate explores across new Runs while persisted candidates stay stable', async () => {
  const requestBody = {
    menuDate: '2026-10-06',
    mealType: 'dinner',
    peopleCount: 2,
    maxPrepMinutes: 60,
    structure: { meat: 1, vegetable: 2, soup: 1, staple: 0 },
    preferences: { selectedTagIds: [] }
  }
  const runs = []
  for (let index = 0; index < 5; index += 1) {
    const response = await requestAs(fixture.users.userA, '/api/recommendations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    const payload = await response.json()
    assert.equal(response.status, 201, JSON.stringify(payload))
    runs.push(payload.data)
  }
  const signatures = runs.map((run) => run.candidates.map((candidate) => candidate.items.map((item) => item.recipeId).join(',')).join('|'))
  assert.ok(new Set(signatures).size > 1, signatures.join('\n'))

  const persistedRun = runs[0]
  for (const rank of [1, 2, 3]) {
    const first = await requestAs(fixture.users.userA, `/api/recommendations/${persistedRun.runId}/candidates/${rank}`)
    const second = await requestAs(fixture.users.userA, `/api/recommendations/${persistedRun.runId}/candidates/${rank}`)
    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    assert.deepEqual(await first.json(), await second.json())
  }
})

integrationTest('real Single Active Family concurrency allows one join and excludes left membership', async () => {
  const responses = await Promise.all(['P1CCCC', 'P1CDDD'].map((inviteCode) => requestAs(fixture.users.joinUser, '/api/families/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ inviteCode }) })))
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409])
  assert.equal((await queryOne("SELECT COUNT(*) AS count FROM family_members WHERE user_id = ? AND status = 'active'", [fixture.users.joinUser])).count, 1)
  const joined = await queryOne("SELECT id FROM family_members WHERE user_id = ? AND status = 'active'", [fixture.users.joinUser])
  await database.execute("UPDATE family_members SET status = 'left' WHERE id = ?", [joined.id])
  const me = await requestAs(fixture.users.joinUser, '/api/auth/me')
  assert.equal(me.status, 200)
  assert.equal((await me.json()).data.membership, null)
})

integrationTest('real Preference Management API persists, updates, scopes, and removes member preferences', async () => {
  const recipeCountBefore = (await queryOne('SELECT COUNT(*) AS count FROM recipes WHERE family_id = ?', [fixture.families.familyA])).count
  const save = await requestAs(fixture.users.userA, `/api/family-members/${fixture.members.memberA2}/preferences/荤菜`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preferenceScore: 5 }) })
  assert.equal(save.status, 200)
  assert.equal((await queryOne('SELECT preference_score FROM member_category_preferences WHERE member_id = ? AND category = ?', [fixture.members.memberA2, '荤菜'])).preference_score, 5)
  const ownerRead = await requestAs(fixture.users.userA, `/api/family-members/${fixture.members.memberA2}/preferences`)
  assert.deepEqual((await ownerRead.json()).data, [{ category: '荤菜', preferenceScore: 5 }])

  const update = await requestAs(fixture.users.userA, `/api/family-members/${fixture.members.memberA2}/preferences/荤菜`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preferenceScore: 1 }) })
  assert.equal(update.status, 200)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM member_category_preferences WHERE member_id = ? AND category = ?', [fixture.members.memberA2, '荤菜'])).count, 1)
  assert.equal((await queryOne('SELECT preference_score FROM member_category_preferences WHERE member_id = ? AND category = ?', [fixture.members.memberA2, '荤菜'])).preference_score, 1)

  const ownerSetsOther = await requestAs(fixture.users.userA, `/api/family-members/${fixture.members.memberA3}/preferences/主食`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preferenceScore: 3 }) })
  assert.equal(ownerSetsOther.status, 200)
  assert.equal((await requestAs(fixture.users.memberA2User, `/api/family-members/${fixture.members.memberA2}/preferences`)).status, 200)
  const memberSetsOther = await requestAs(fixture.users.memberA2User, `/api/family-members/${fixture.members.memberA3}/preferences/主食`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preferenceScore: 5 }) })
  assert.equal(memberSetsOther.status, 403)
  assert.equal((await requestAs(fixture.users.userA, `/api/family-members/${fixture.members.memberB}/preferences`)).status, 404)

  await database.execute("UPDATE family_members SET status = 'left' WHERE id = ?", [fixture.members.memberA3])
  assert.equal((await requestAs(fixture.users.userA, `/api/family-members/${fixture.members.memberA3}/preferences`)).status, 404)
  const remove = await requestAs(fixture.users.userA, `/api/family-members/${fixture.members.memberA2}/preferences/荤菜`, { method: 'DELETE' })
  const removeAgain = await requestAs(fixture.users.userA, `/api/family-members/${fixture.members.memberA2}/preferences/荤菜`, { method: 'DELETE' })
  assert.equal(remove.status, 200)
  assert.equal((await remove.json()).data.status, 'removed')
  assert.equal(removeAgain.status, 200)
  assert.equal((await removeAgain.json()).data.status, 'already-absent')
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM member_category_preferences WHERE member_id = ? AND category = ?', [fixture.members.memberA2, '荤菜'])).count, 0)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM recipes WHERE family_id = ?', [fixture.families.familyA])).count, recipeCountBefore)
})

integrationTest('real Preference summary includes only saved preferences of active members in the current Family', async () => {
  await database.execute('INSERT INTO member_category_preferences (member_id, category, preference_score) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)', [fixture.members.memberA, '荤菜', 5, fixture.members.memberA2, '素菜', 1, fixture.members.memberB, '汤', 5])
  await database.execute('INSERT INTO member_category_preferences (member_id, category, preference_score) VALUES (?, ?, ?)', [fixture.members.memberA3, '主食', 3])
  let response = await requestAs(fixture.users.userA, '/api/families/current/preferences')
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).data.map((item) => [item.memberId, item.category]), [[fixture.members.memberA, '荤菜'], [fixture.members.memberA2, '素菜'], [fixture.members.memberA3, '主食']])
  await database.execute("UPDATE family_members SET status = 'left' WHERE id = ?", [fixture.members.memberA3])
  response = await requestAs(fixture.users.userA, '/api/families/current/preferences')
  assert.deepEqual((await response.json()).data.map((item) => [item.memberId, item.category]), [[fixture.members.memberA, '荤菜'], [fixture.members.memberA2, '素菜']])
})

integrationTest('real Recommendation aggregates active-member preferences with unset members as neutral', async () => {
  let response = await requestAs(fixture.users.userA, '/api/recommendations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ menuDate: '2026-09-17', mealType: 'dinner', peopleCount: 2, maxCookMinutes: 90, mode: 'balanced' }) })
  assert.equal(response.status, 200)
  let data = (await response.json()).data
  assert.equal(data.items.find((item) => item.category === '荤菜').score.parts.preference, 70)
  assert.match(data.items.find((item) => item.category === '荤菜').score.reason, /家庭未设置荤菜偏好/)

  await database.execute('INSERT INTO member_category_preferences (member_id, category, preference_score) VALUES (?, ?, ?)', [fixture.members.memberA, '荤菜', 5])
  response = await requestAs(fixture.users.userA, '/api/recommendations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ menuDate: '2026-09-18', mealType: 'dinner', peopleCount: 2, maxCookMinutes: 90, mode: 'balanced' }) })
  data = (await response.json()).data
  assert.equal(data.items.find((item) => item.category === '荤菜').score.parts.preference, 70 + (2 / 3) * 8)

  await database.execute('INSERT INTO member_category_preferences (member_id, category, preference_score) VALUES (?, ?, ?), (?, ?, ?)', [fixture.members.memberA2, '荤菜', 1, fixture.members.memberA3, '荤菜', 5])
  await database.execute('INSERT INTO member_category_preferences (member_id, category, preference_score) VALUES (?, ?, ?)', [fixture.members.memberB, '荤菜', 1])
  response = await requestAs(fixture.users.userA, '/api/recommendations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ menuDate: '2026-09-19', mealType: 'dinner', peopleCount: 2, maxCookMinutes: 90, mode: 'balanced' }) })
  data = (await response.json()).data
  assert.equal(data.items.find((item) => item.category === '荤菜').score.parts.preference, 70 + (2 / 3) * 8)

  await database.execute("UPDATE family_members SET status = 'left' WHERE id = ?", [fixture.members.memberA2])
  response = await requestAs(fixture.users.userA, '/api/recommendations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ menuDate: '2026-09-20', mealType: 'dinner', peopleCount: 2, maxCookMinutes: 90, mode: 'balanced' }) })
  data = (await response.json()).data
  assert.equal(data.items.find((item) => item.category === '荤菜').score.parts.preference, 86)
})

integrationTest('real Recommendation preference changes ordering and persists the aligned score and reason', async () => {
  const comparableMeat = await insertRecipe(database, { familyId: fixture.families.familyA, memberId: fixture.members.memberA, title: '可比荤菜', category: '荤菜', cookMinutes: 20, ingredientIds: [fixture.ingredients.ingredientZ] })
  const comparableVegetable = await insertRecipe(database, { familyId: fixture.families.familyA, memberId: fixture.members.memberA, title: '可比素菜', category: '素菜', cookMinutes: 20, ingredientIds: [fixture.ingredients.ingredientZ] })
  await database.execute('INSERT INTO member_category_preferences (member_id, category, preference_score) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?)', [fixture.members.memberA, '荤菜', 5, fixture.members.memberA2, '荤菜', 5, fixture.members.memberA3, '荤菜', 5, fixture.members.memberA, '素菜', 1, fixture.members.memberA2, '素菜', 1, fixture.members.memberA3, '素菜', 1])
  let response = await requestAs(fixture.users.userA, '/api/recommendations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ menuDate: '2026-09-21', mealType: 'dinner', peopleCount: 2, maxCookMinutes: 90, mode: 'quick' }) })
  assert.equal(response.status, 200)
  let data = (await response.json()).data
  assert.equal(data.items[0].category, '荤菜')
  const firstMeat = data.items.find((item) => item.category === '荤菜')
  assert.equal(firstMeat.score.parts.preference, 86)
  const firstPersisted = await queryOne('SELECT dish_score, reason_text FROM recommendation_items WHERE recommendation_run_id = ? AND recipe_id = ?', [data.runId, firstMeat.id])
  assert.equal(firstPersisted.dish_score, firstMeat.score.total)
  assert.equal(firstPersisted.reason_text, firstMeat.score.reason)

  await database.execute("UPDATE member_category_preferences SET preference_score = CASE category WHEN '荤菜' THEN 1 WHEN '素菜' THEN 5 ELSE preference_score END WHERE member_id IN (?, ?, ?)", [fixture.members.memberA, fixture.members.memberA2, fixture.members.memberA3])
  response = await requestAs(fixture.users.userA, '/api/recommendations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ menuDate: '2026-09-22', mealType: 'dinner', peopleCount: 2, maxCookMinutes: 90, mode: 'quick' }) })
  data = (await response.json()).data
  assert.equal(data.items[0].category, '素菜')
  assert.equal(data.items.find((item) => item.category === '素菜').score.parts.preference, 86)
})

integrationTest('real Restriction remains a hard override over a high category preference', async () => {
  const highlyPreferredButRestricted = await insertRecipe(database, { familyId: fixture.families.familyA, memberId: fixture.members.memberA, title: '高偏好但受限', category: '荤菜', cookMinutes: 20, ingredientIds: [fixture.ingredients.ingredientA] })
  await database.execute('INSERT INTO member_category_preferences (member_id, category, preference_score) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)', [fixture.members.memberA, '荤菜', 5, fixture.members.memberA2, '荤菜', 5, fixture.members.memberA3, '荤菜', 5])
  await database.execute('INSERT INTO member_ingredient_restrictions (member_id, ingredient_id) VALUES (?, ?)', [fixture.members.memberA2, fixture.ingredients.ingredientA])
  const response = await requestAs(fixture.users.userA, '/api/recommendations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ menuDate: '2026-09-23', mealType: 'dinner', peopleCount: 2, maxCookMinutes: 90, mode: 'quick' }) })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).data.items.some((item) => item.id === highlyPreferredButRestricted), false)
})

integrationTest('real Recipe cover upload persists CloudBase IDs and survives Recipe create/edit reads', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xd9])
  const upload = async (buffer, filename) => {
    const form = new FormData()
    form.append('file', new Blob([buffer], { type: 'image/jpeg' }), filename)
    return requestAs(fixture.users.userA, '/api/uploads/recipe-cover', { method: 'POST', body: form })
  }
  const firstUpload = await upload(jpeg, 'first.jpg')
  assert.equal(firstUpload.status, 201)
  const firstUploadData = (await firstUpload.json()).data
  const firstCoverFileId = firstUploadData.coverFileId
  assert.match(firstCoverFileId, /^cloud:\/\/test\.bucket\/families\/\d+\/recipes\/[a-f0-9-]+\.jpg$/)
  assert.match(firstUploadData.coverUrl, /^https:\/\/temp\.test\//)

  const createResponse = await requestAs(fixture.users.userA, '/api/recipes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '持久化封面菜谱', category: '荤菜', steps: '上传封面并保存', cookMinutes: 20, difficulty: 2, ingredients: [{ ingredientId: fixture.ingredients.ingredientZ, amountGrams: 100 }], coverFileId: firstCoverFileId, coverUrl: firstUploadData.coverUrl }) })
  assert.equal(createResponse.status, 201)
  const recipeId = (await createResponse.json()).data.id
  assert.equal((await queryOne('SELECT cover_url FROM recipes WHERE id = ?', [recipeId])).cover_url, firstCoverFileId)
  assert.equal((await requestAs(fixture.users.userA, `/api/recipes/${recipeId}`)).status, 200)
  const firstRecipe = (await (await requestAs(fixture.users.userA, `/api/recipes/${recipeId}`)).json()).data
  assert.equal(firstRecipe.coverFileId, firstCoverFileId)
  assert.equal(firstRecipe.coverUrl, firstUploadData.coverUrl)

  const secondUpload = await upload(jpeg, 'second.jpg')
  assert.equal(secondUpload.status, 201)
  const secondUploadData = (await secondUpload.json()).data
  const editResponse = await requestAs(fixture.users.userA, `/api/recipes/${recipeId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '持久化封面菜谱（更新）', category: '荤菜', steps: '更新后的步骤', cookMinutes: 25, difficulty: 2, ingredients: [{ ingredientId: fixture.ingredients.ingredientZ, amountGrams: 100 }], coverFileId: secondUploadData.coverFileId, coverUrl: secondUploadData.coverUrl }) })
  assert.equal(editResponse.status, 200)
  assert.equal((await queryOne('SELECT cover_url FROM recipes WHERE id = ?', [recipeId])).cover_url, secondUploadData.coverFileId)
  const list = await (await requestAs(fixture.users.userA, '/api/recipes')).json()
  assert.equal(list.data.find((recipe) => recipe.id === recipeId).coverFileId, secondUploadData.coverFileId)
  assert.equal(list.data.find((recipe) => recipe.id === recipeId).coverUrl, secondUploadData.coverUrl)
  const secondRecipe = (await (await requestAs(fixture.users.userA, `/api/recipes/${recipeId}`)).json()).data
  assert.equal(secondRecipe.coverFileId, secondUploadData.coverFileId)
  assert.equal(secondRecipe.coverUrl, secondUploadData.coverUrl)
})

integrationTest('real Feedback persists idempotently, updates Insights, respects Family and member boundaries, and follows history FK behavior', async () => {
  const menuItemId = await insertMenuItem(database, fixture.menus.menuA, fixture.recipes.recipeX, 'manual', '反馈测试')
  const first = await requestAs(fixture.users.userA, `/api/menu-items/${menuItemId}/feedback`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rating: 4, comment: '第一次评分' }) })
  assert.equal(first.status, 201)
  assert.deepEqual((await first.json()).data, { menuItemId, rating: 4, comment: '第一次评分', status: 'created' })
  assert.deepEqual(await queryOne('SELECT menu_item_id, member_id, rating, comment FROM menu_feedback WHERE menu_item_id = ? AND member_id = ?', [menuItemId, fixture.members.memberA]), { menu_item_id: menuItemId, member_id: fixture.members.memberA, rating: 4, comment: '第一次评分' })

  const menus = await requestAs(fixture.users.userA, '/api/menus?date=2026-09-08')
  assert.equal(menus.status, 200)
  assert.deepEqual((await menus.json()).data.find((menu) => menu.id === fixture.menus.menuA).items.find((item) => item.id === menuItemId).feedback, { rating: 4, comment: '第一次评分' })
  assert.deepEqual((await (await requestAs(fixture.users.userA, `/api/menu-items/${menuItemId}/feedback`)).json()).data, { rating: 4, comment: '第一次评分' })

  const updated = await requestAs(fixture.users.userA, `/api/menu-items/${menuItemId}/feedback`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rating: 5, comment: '更新评分' }) })
  assert.equal(updated.status, 200)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM menu_feedback WHERE menu_item_id = ? AND member_id = ?', [menuItemId, fixture.members.memberA])).count, 1)
  assert.deepEqual((await queryOne('SELECT rating, comment FROM menu_feedback WHERE menu_item_id = ? AND member_id = ?', [menuItemId, fixture.members.memberA])), { rating: 5, comment: '更新评分' })

  let insights = await requestAs(fixture.users.userA, '/api/insights?days=30')
  assert.equal(insights.status, 200)
  assert.equal((await insights.json()).data.summary.averageRating, 5)

  const secondMemberFeedback = await requestAs(fixture.users.memberA2User, `/api/menu-items/${menuItemId}/feedback`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rating: 3 }) })
  assert.equal(secondMemberFeedback.status, 201)
  insights = await requestAs(fixture.users.userA, '/api/insights?days=30')
  assert.equal((await insights.json()).data.summary.averageRating, 4)

  const familyBFeedback = await requestAs(fixture.users.userB, `/api/menu-items/${fixture.menus.menuBItem}/feedback`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rating: 1 }) })
  assert.equal(familyBFeedback.status, 201)
  insights = await requestAs(fixture.users.userA, '/api/insights?days=30')
  assert.equal((await insights.json()).data.summary.averageRating, 4)
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const response = await requestAs(fixture.users.userA, `/api/menu-items/${fixture.menus.menuBItem}/feedback`, { method, ...(method === 'PUT' ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rating: 5 }) } : {}) })
    assert.equal(response.status, 404)
  }
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM menu_feedback WHERE menu_item_id = ?', [fixture.menus.menuBItem])).count, 1)

  await database.execute("UPDATE family_members SET status = 'left' WHERE id = ?", [fixture.members.memberA2])
  const leftMemberUpdate = await requestAs(fixture.users.memberA2User, `/api/menu-items/${menuItemId}/feedback`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rating: 1 }) })
  assert.equal(leftMemberUpdate.status, 403)
  assert.equal((await queryOne('SELECT rating FROM menu_feedback WHERE menu_item_id = ? AND member_id = ?', [menuItemId, fixture.members.memberA2])).rating, 3)

  const removed = await requestAs(fixture.users.userA, `/api/menu-items/${menuItemId}/feedback`, { method: 'DELETE' })
  assert.equal(removed.status, 200)
  assert.equal((await removed.json()).data.status, 'removed')
  insights = await requestAs(fixture.users.userA, '/api/insights?days=30')
  assert.equal((await insights.json()).data.summary.averageRating, 3)
  const removedAgain = await requestAs(fixture.users.userA, `/api/menu-items/${menuItemId}/feedback`, { method: 'DELETE' })
  assert.equal((await removedAgain.json()).data.status, 'already-absent')

  await database.execute("UPDATE recipes SET status = 'deleted' WHERE id = ?", [fixture.recipes.recipeX])
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM menu_feedback WHERE menu_item_id = ?', [menuItemId])).count, 1)
  assert.equal((await queryOne('SELECT status FROM recipes WHERE id = ?', [fixture.recipes.recipeX])).status, 'deleted')

  const deleteMenuItem = await requestAs(fixture.users.userA, `/api/menus/items/${menuItemId}`, { method: 'DELETE' })
  assert.equal(deleteMenuItem.status, 200)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM menu_feedback WHERE menu_item_id = ?', [menuItemId])).count, 0)
  assert.equal((await queryOne('SELECT id FROM menus WHERE id = ?', [fixture.menus.menuA])).id, fixture.menus.menuA)
  assert.equal((await queryOne('SELECT id, status FROM recipes WHERE id = ?', [fixture.recipes.recipeX])).status, 'deleted')
})

integrationTest('T1 recipe_tags table exposes the tag_id association contract', async () => {
  const table = await queryOne('SELECT table_name AS table_name FROM information_schema.tables WHERE table_schema = ? AND table_name = ?', [testDatabase, 'recipe_tags'])
  assert.equal(table.table_name, 'recipe_tags')
  const index = await queryOne('SELECT index_name AS index_name FROM information_schema.statistics WHERE table_schema = ? AND table_name = ? AND index_name = ?', [testDatabase, 'recipe_tags', 'idx_recipe_tags_tag'])
  assert.equal(index.index_name, 'idx_recipe_tags_tag')
  const columns = await queryRows('SELECT column_name AS columnName FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position', [testDatabase, 'recipe_tags'])
  assert.deepEqual(columns.map((row) => row.columnName), ['recipe_id', 'tag_id'])
})

integrationTest('T1 tag definitions enforce system scope and recipe relation foreign keys', async () => {
  const system = await queryOne("SELECT id FROM tag_definitions WHERE kind = 'system' AND code = 'spicy'")
  await database.execute('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)', [fixture.recipes.recipeX, system.id])
  await assert.rejects(database.execute("INSERT INTO tag_definitions (kind, code, name, normalized_name, family_id) VALUES ('system', 'bad-system', '坏', '坏', ?)", [fixture.families.familyA]))
  await assert.rejects(database.execute('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, 999999)', [fixture.recipes.recipeX]))
})

integrationTest('T1 recipe_tags allows multiple definitions, rejects duplicate relations, and cascades with Recipe deletion', async () => {
  const recipeId = await insertRecipe(database, { familyId: fixture.families.familyA, memberId: fixture.members.memberA, title: 'R1 tag cascade', category: '荤菜', ingredientIds: [fixture.ingredients.ingredientZ] })
  const ensureSystemTag = async (code, name) => {
    const existing = await queryOne('SELECT id FROM tag_definitions WHERE kind = \'system\' AND code = ?', [code])
    if (existing) return existing.id
    const [result] = await database.execute('INSERT INTO tag_definitions (kind, code, name, normalized_name) VALUES (\'system\', ?, ?, ?)', [code, name, name])
    return result.insertId
  }
  const spicyId = await ensureSystemTag('spicy', '辣')
  const steamId = await ensureSystemTag('steam', '蒸')
  await database.execute('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?), (?, ?)', [recipeId, spicyId, recipeId, steamId])
  await assert.rejects(database.execute('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)', [recipeId, spicyId]))
  await database.execute('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)', [fixture.recipes.recipeY, spicyId])
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM recipe_tags WHERE recipe_id = ?', [recipeId])).count, 2)
  await database.execute('DELETE FROM recipes WHERE id = ?', [recipeId])
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM recipe_tags WHERE recipe_id = ?', [recipeId])).count, 0)
})

integrationTest('T1 recipe_tags rejects an unknown Recipe through its foreign key', async () => {
  const tag = await queryOne("SELECT id FROM tag_definitions WHERE kind = 'system' AND code = 'spicy'")
  if (!tag) {
    const [result] = await database.execute("INSERT INTO tag_definitions (kind, code, name, normalized_name) VALUES ('system', 'spicy', '辣', '辣')")
    await assert.rejects(database.execute('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (999999, ?)', [result.insertId]))
    return
  }
  await assert.rejects(database.execute('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (999999, ?)', [tag.id]))
})

integrationTest('T2 Tag CRUD enforces family scope, ownership, system immutability, and hard deletion', async () => {
  const list = await (await requestAs(fixture.users.userA, '/api/tags')).json()
  assert.deepEqual(list.data.systemTags.map((tag) => tag.code), ['spicy', 'sour', 'sweet', 'seafood', 'fish', 'shrimp', 'crab', 'bake', 'steam', 'fried'])
  assert.deepEqual(list.data.customTags, [])

  const create = await requestAs(fixture.users.memberA2User, '/api/tags', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: '  家常菜  ', family_id: fixture.families.familyB, kind: 'system', created_by_member_id: fixture.members.memberA })
  })
  assert.equal(create.status, 201)
  const custom = (await create.json()).data
  assert.equal(custom.familyId, fixture.families.familyA)
  assert.equal(custom.createdByMemberId, fixture.members.memberA2)

  const duplicate = await requestAs(fixture.users.userA, '/api/tags', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '家常菜' })
  })
  assert.equal(duplicate.status, 409)

  const memberRename = await requestAs(fixture.users.memberA2User, `/api/tags/${custom.id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '家常菜改名' })
  })
  assert.equal(memberRename.status, 200)
  const systemRename = await requestAs(fixture.users.userA, '/api/tags/1', {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '系统标签不可改' })
  })
  assert.equal(systemRename.status, 403)

  const deletion = await requestAs(fixture.users.userA, `/api/tags/${custom.id}`, { method: 'DELETE' })
  assert.equal(deletion.status, 200)
  const repeatDeletion = await requestAs(fixture.users.userA, `/api/tags/${custom.id}`, { method: 'DELETE' })
  assert.equal(repeatDeletion.status, 404)
  const activeList = await (await requestAs(fixture.users.userA, '/api/tags')).json()
  assert.deepEqual(activeList.data.customTags, [])
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM tag_definitions WHERE id = ?', [custom.id])).count, 0)

  const [otherTag] = await database.execute(
    `INSERT INTO tag_definitions (family_id, kind, name, normalized_name, status, created_by_member_id)
     VALUES (?, 'custom', '家庭 B 标签', '家庭 B 标签', 'active', ?)`, [fixture.families.familyB, fixture.members.memberB]
  )
  const otherFamily = { id: otherTag.insertId }
  assert.equal((await requestAs(fixture.users.userA, `/api/tags/${otherFamily.id}`)).status, 404)
})

integrationTest('T2 Recipe create and update persist a deduplicated tag set transactionally', async () => {
  const spicy = await queryOne("SELECT id FROM tag_definitions WHERE kind = 'system' AND code = 'spicy'")
  const [customInsert] = await database.execute(
    `INSERT INTO tag_definitions (family_id, kind, name, normalized_name, status, created_by_member_id)
     VALUES (?, 'custom', '可口', '可口', 'active', ?)`, [fixture.families.familyA, fixture.members.memberA]
  )
  const create = await requestAs(fixture.users.userA, '/api/recipes', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '带标签菜谱', category: '荤菜', steps: '测试步骤', cookMinutes: 20, difficulty: 2, ingredients: [{ ingredientId: fixture.ingredients.ingredientA, amountGrams: 100 }], tagIds: [spicy.id, customInsert.insertId, customInsert.insertId] })
  })
  assert.equal(create.status, 201)
  const recipeId = (await create.json()).data.id
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM recipe_tags WHERE recipe_id = ?', [recipeId])).count, 2)
  const detail = await (await requestAs(fixture.users.userA, `/api/recipes/${recipeId}`)).json()
  assert.deepEqual(detail.data.tags.map((tag) => tag.id).sort((a, b) => a - b), [spicy.id, customInsert.insertId].sort((a, b) => a - b))

  const edit = await requestAs(fixture.users.userA, `/api/recipes/${recipeId}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '带标签菜谱更新', category: '荤菜', steps: '更新步骤', cookMinutes: 20, difficulty: 2, ingredients: [{ ingredientId: fixture.ingredients.ingredientA, amountGrams: 100 }], tagIds: [] })
  })
  assert.equal(edit.status, 200)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM recipe_tags WHERE recipe_id = ?', [recipeId])).count, 0)
})

integrationTest('T2 deleting a custom tag removes its recipe relations from list and detail', async () => {
  const [custom] = await database.execute(
    `INSERT INTO tag_definitions (family_id, kind, name, normalized_name, status, created_by_member_id)
     VALUES (?, 'custom', '历史标签', '历史标签', 'active', ?)`, [fixture.families.familyA, fixture.members.memberA]
  )
  await database.execute('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)', [fixture.recipes.recipeX, custom.insertId])
  assert.equal((await requestAs(fixture.users.userA, `/api/tags/${custom.insertId}`, { method: 'DELETE' })).status, 200)

  const list = await (await requestAs(fixture.users.userA, '/api/recipes')).json()
  const listRecipe = list.data.find((recipe) => recipe.id === fixture.recipes.recipeX)
  assert.ok(listRecipe)
  assert.equal(listRecipe.tags.some((tag) => tag.id === custom.insertId), false)

  const detail = await (await requestAs(fixture.users.userA, `/api/recipes/${fixture.recipes.recipeX}`)).json()
  const historicalTag = detail.data.tags.find((tag) => tag.id === custom.insertId)
  assert.equal(historicalTag, undefined)
})

integrationTest('T2 cross-family and deleted tag references return safe errors and leave Recipe unchanged', async () => {
  const [otherTag] = await database.execute(
    `INSERT INTO tag_definitions (family_id, kind, name, normalized_name, status, created_by_member_id)
     VALUES (?, 'custom', '家庭 B 标签', '家庭 B 标签', 'active', ?)`, [fixture.families.familyB, fixture.members.memberB]
  )
  const before = await queryOne('SELECT title FROM recipes WHERE id = ?', [fixture.recipes.oldRecipe])
  const response = await requestAs(fixture.users.userA, `/api/recipes/${fixture.recipes.oldRecipe}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '不应保存', category: '荤菜', steps: '步骤', cookMinutes: 20, difficulty: 2, ingredients: [{ ingredientId: fixture.ingredients.ingredientA, amountGrams: 100 }], tagIds: [otherTag.insertId] })
  })
  assert.equal(response.status, 404)
  assert.equal((await queryOne('SELECT title FROM recipes WHERE id = ?', [fixture.recipes.oldRecipe])).title, before.title)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM recipe_tags WHERE recipe_id = ?', [fixture.recipes.oldRecipe])).count, 0)
})

integrationTest('T3 canonical Generate validates tag identity, persists normalized preferences, and snapshots tag reasons', async () => {
  const [custom] = await database.execute(
    `INSERT INTO tag_definitions (family_id, kind, name, normalized_name, status, created_by_member_id)
     VALUES (?, 'custom', '家庭偏好标签', '家庭偏好标签', 'active', ?)`, [fixture.families.familyA, fixture.members.memberA]
  )
  const familyRecipes = await queryRows("SELECT id FROM recipes WHERE family_id = ? AND status = 'active'", [fixture.families.familyA])
  for (const row of familyRecipes) await database.execute('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)', [row.id, custom.insertId])
  const first = await requestAs(fixture.users.userA, '/api/recommendations', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ menuDate: '2026-10-01', mealType: 'dinner', peopleCount: 2, maxPrepMinutes: 120, structure: { meat: 1, vegetable: 1, soup: 1, staple: 0 }, preferences: { selectedTagIds: [custom.insertId, custom.insertId] } })
  })
  assert.equal(first.status, 201)
  const firstData = await first.json()
  const firstRun = await queryOne('SELECT session_preferences FROM recommendation_runs WHERE id = ?', [firstData.data.runId])
  assert.deepEqual(parseJsonValue(firstRun.session_preferences), { selectedTagIds: [custom.insertId] })
  const firstCandidate = await queryOne('SELECT reason_text, score_breakdown FROM recommendation_candidates WHERE recommendation_run_id = ? AND candidate_rank = 1', [firstData.data.runId])
  assert.match(firstCandidate.reason_text, /家庭偏好标签/)
  const oldReason = firstCandidate.reason_text

  assert.equal((await requestAs(fixture.users.userA, `/api/tags/${custom.insertId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '重命名偏好标签' }) })).status, 200)
  const second = await requestAs(fixture.users.userA, '/api/recommendations', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ menuDate: '2026-10-02', mealType: 'dinner', peopleCount: 2, maxPrepMinutes: 120, structure: { meat: 1, vegetable: 1, soup: 1, staple: 0 }, preferences: { selectedTagIds: [custom.insertId] } })
  })
  assert.equal(second.status, 201)
  const secondData = await second.json()
  const secondCandidate = await queryOne('SELECT reason_text FROM recommendation_candidates WHERE recommendation_run_id = ? AND candidate_rank = 1', [secondData.data.runId])
  assert.match(secondCandidate.reason_text, /重命名偏好标签/)
  assert.equal((await queryOne('SELECT reason_text FROM recommendation_candidates WHERE recommendation_run_id = ? AND candidate_rank = 1', [firstData.data.runId])).reason_text, oldReason)

  assert.equal((await requestAs(fixture.users.userA, `/api/tags/${custom.insertId}`, { method: 'DELETE' })).status, 200)
  const deletedTag = await requestAs(fixture.users.userA, '/api/recommendations', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ menuDate: '2026-10-03', mealType: 'dinner', peopleCount: 2, maxPrepMinutes: 120, structure: { meat: 1, vegetable: 1, soup: 1, staple: 0 }, preferences: { selectedTagIds: [custom.insertId] } })
  })
  assert.equal(deletedTag.status, 404)
  assert.equal((await requestAs(fixture.users.userA, `/api/recommendations/${firstData.data.runId}/candidates/1`)).status, 200)
})

integrationTest('T3 tag preference is soft, and restriction remains a hard override', async () => {
  const fried = await queryOne("SELECT id FROM tag_definitions WHERE kind = 'system' AND code = 'fried'")
  const noMatch = await requestAs(fixture.users.userA, '/api/recommendations', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ menuDate: '2026-10-04', mealType: 'dinner', peopleCount: 2, maxPrepMinutes: 120, structure: { meat: 1, vegetable: 1, soup: 1, staple: 0 }, preferences: { selectedTagIds: [fried.id] } })
  })
  assert.equal(noMatch.status, 201)
  const noMatchData = await noMatch.json()
  const noMatchCandidate = await queryOne('SELECT score_breakdown FROM recommendation_candidates WHERE recommendation_run_id = ? AND candidate_rank = 1', [noMatchData.data.runId])
  assert.equal(parseJsonValue(noMatchCandidate.score_breakdown).tagPreference.score, 0)

  const [custom] = await database.execute(
    `INSERT INTO tag_definitions (family_id, kind, name, normalized_name, status, created_by_member_id)
     VALUES (?, 'custom', '高偏好但受限', '高偏好但受限', 'active', ?)`, [fixture.families.familyA, fixture.members.memberA]
  )
  await database.execute('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)', [fixture.recipes.recipeX, custom.insertId])
  await database.execute('INSERT INTO member_ingredient_restrictions (member_id, ingredient_id) VALUES (?, ?)', [fixture.members.memberA, fixture.ingredients.ingredientX])
  const restricted = await requestAs(fixture.users.userA, '/api/recommendations', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ menuDate: '2026-10-05', mealType: 'dinner', peopleCount: 2, maxPrepMinutes: 120, structure: { meat: 1, vegetable: 1, soup: 1, staple: 0 }, preferences: { selectedTagIds: [custom.insertId] } })
  })
  assert.equal(restricted.status, 201)
  const restrictedData = await restricted.json()
  const restrictedItems = await queryRows('SELECT recipe_id AS recipeId FROM recommendation_candidate_items rci INNER JOIN recommendation_candidates rc ON rc.id = rci.recommendation_candidate_id WHERE rc.recommendation_run_id = ?', [restrictedData.data.runId])
  assert.equal(restrictedItems.some((row) => Number(row.recipeId) === fixture.recipes.recipeX), false)
})

integrationTest('T3 cross-family custom tag is rejected without exposing tag details', async () => {
  const [otherTag] = await database.execute(
    `INSERT INTO tag_definitions (family_id, kind, name, normalized_name, status, created_by_member_id)
     VALUES (?, 'custom', '家庭 B 私有标签', '家庭 B 私有标签', 'active', ?)`, [fixture.families.familyB, fixture.members.memberB]
  )
  const response = await requestAs(fixture.users.userA, '/api/recommendations', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ menuDate: '2026-10-06', mealType: 'dinner', peopleCount: 2, maxPrepMinutes: 120, structure: { meat: 1, vegetable: 1, soup: 1, staple: 0 }, preferences: { selectedTagIds: [otherTag.insertId] } })
  })
  const body = await response.text()
  assert.equal(response.status, 404)
  assert.doesNotMatch(body, /家庭 B 私有标签/)
})

integrationTest('R1 recommendation Run keeps legacy rows valid with nullable canonical snapshots', async () => {
  const legacy = await queryOne('SELECT max_prep_minutes, menu_structure, session_preferences FROM recommendation_runs WHERE id = ?', [fixture.runs.runA])
  assert.equal(legacy.max_prep_minutes, null)
  assert.equal(legacy.menu_structure, null)
  assert.equal(legacy.session_preferences, null)
  const legacyFields = await queryOne('SELECT max_cook_minutes, mode, total_score, total_cook_minutes, score_breakdown FROM recommendation_runs WHERE id = ?', [fixture.runs.runA])
  assert.equal(legacyFields.max_cook_minutes, 90)
  assert.equal(legacyFields.mode, 'balanced')
  assert.equal(Number(legacyFields.total_score), 80)
  assert.equal(legacyFields.total_cook_minutes, 30)
  assert.deepEqual(parseJsonValue(legacyFields.score_breakdown), {})
  const [created] = await database.execute(
    `INSERT INTO recommendation_runs (family_id, created_by_member_id, menu_date, meal_type, people_count, max_cook_minutes, max_prep_minutes, mode, total_score, total_cook_minutes, score_breakdown, menu_structure, session_preferences)
     VALUES (?, ?, '2026-09-30', 'dinner', 3, 90, 80, 'balanced', 80, 30, '{}', ?, ?)`,
    [fixture.families.familyA, fixture.members.memberA, JSON.stringify({ meat: 1, vegetable: 2, soup: 1, staple: 0 }), JSON.stringify({ tasteTags: ['spicy'], dietaryTags: [], seasonal: true })]
  )
  const row = await queryOne('SELECT max_prep_minutes, menu_structure, session_preferences FROM recommendation_runs WHERE id = ?', [created.insertId])
  assert.equal(row.max_prep_minutes, 80)
  assert.deepEqual(parseJsonValue(row.menu_structure), { meat: 1, vegetable: 2, soup: 1, staple: 0 })
  assert.deepEqual(parseJsonValue(row.session_preferences), { tasteTags: ['spicy'], dietaryTags: [], seasonal: true })
})

integrationTest('R1.1 canonical Run can leave legacy-only summaries NULL while saving canonical snapshots', async () => {
  const [created] = await database.execute(
    `INSERT INTO recommendation_runs (family_id, created_by_member_id, menu_date, meal_type, people_count, max_cook_minutes, max_prep_minutes, mode, total_score, total_cook_minutes, score_breakdown, menu_structure, session_preferences)
     VALUES (?, ?, '2026-11-01', 'dinner', 3, NULL, 80, NULL, NULL, NULL, NULL, ?, ?)`,
    [fixture.families.familyA, fixture.members.memberA, JSON.stringify({ meat: 1, vegetable: 1, soup: 1, staple: 0 }), JSON.stringify({ tasteTags: [], dietaryTags: [], seasonal: false })]
  )
  const row = await queryOne('SELECT max_cook_minutes, mode, total_score, total_cook_minutes, score_breakdown, max_prep_minutes, menu_structure, session_preferences FROM recommendation_runs WHERE id = ?', [created.insertId])
  assert.equal(row.max_cook_minutes, null)
  assert.equal(row.mode, null)
  assert.equal(row.total_score, null)
  assert.equal(row.total_cook_minutes, null)
  assert.equal(row.score_breakdown, null)
  assert.equal(row.max_prep_minutes, 80)
  assert.deepEqual(parseJsonValue(row.menu_structure), { meat: 1, vegetable: 1, soup: 1, staple: 0 })
  assert.deepEqual(parseJsonValue(row.session_preferences), { tasteTags: [], dietaryTags: [], seasonal: false })
})

integrationTest('R1 recommendation Run rejects invalid prep limits but accepts a canonical limit', async () => {
  const insert = (value) => database.execute(
    `INSERT INTO recommendation_runs (family_id, created_by_member_id, menu_date, meal_type, people_count, max_cook_minutes, max_prep_minutes, mode, total_score, total_cook_minutes, score_breakdown)
     VALUES (?, ?, '2026-10-01', 'dinner', 2, 90, ?, 'balanced', 80, 30, '{}')`,
    [fixture.families.familyA, fixture.members.memberA, value]
  )
  await insert(80)
  await assert.rejects(insert(9))
  await assert.rejects(insert(481))
})

integrationTest('R1 candidate ranks 1 to 3 are unique per Run and reusable across Runs', async () => {
  const insertCandidate = (runId, rank) => database.execute(
    `INSERT INTO recommendation_candidates (recommendation_run_id, candidate_rank, estimated_prep_minutes, total_score, score_breakdown, reason_text)
     VALUES (?, ?, 40, 80, '{}', 'R1')`,
    [runId, rank]
  )
  await insertCandidate(fixture.runs.runA, 1)
  await insertCandidate(fixture.runs.runA, 2)
  await insertCandidate(fixture.runs.runA, 3)
  await assert.rejects(insertCandidate(fixture.runs.runA, 1))
  await insertCandidate(fixture.runs.runB, 1)
  await assert.rejects(insertCandidate(fixture.runs.runA, 4))
})

integrationTest('R1 candidate foreign key rejects an unknown Run', async () => {
  await assert.rejects(database.execute(
    `INSERT INTO recommendation_candidates (recommendation_run_id, candidate_rank, estimated_prep_minutes, total_score, score_breakdown)
     VALUES (999999, 1, 40, 80, '{}')`
  ))
})

integrationTest('R1 deleting a Run cascades its Candidates and Candidate Items', async () => {
  const [candidate] = await database.execute(
    `INSERT INTO recommendation_candidates (recommendation_run_id, candidate_rank, estimated_prep_minutes, total_score, score_breakdown)
     VALUES (?, 1, 40, 80, '{}')`, [fixture.runs.runA]
  )
  await database.execute(
    `INSERT INTO recommendation_candidate_items (recommendation_candidate_id, recipe_id, slot_no, category, dish_score)
     VALUES (?, ?, 1, '荤菜', 80)`, [candidate.insertId, fixture.recipes.recipeX]
  )
  await database.execute('DELETE FROM recommendation_runs WHERE id = ?', [fixture.runs.runA])
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM recommendation_candidates WHERE id = ?', [candidate.insertId])).count, 0)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM recommendation_candidate_items WHERE recommendation_candidate_id = ?', [candidate.insertId])).count, 0)
})

integrationTest('R1 Candidate Items reject duplicate Recipes and duplicate slots', async () => {
  const [candidate] = await database.execute(
    `INSERT INTO recommendation_candidates (recommendation_run_id, candidate_rank, estimated_prep_minutes, total_score, score_breakdown)
     VALUES (?, 1, 40, 80, '{}')`, [fixture.runs.runA]
  )
  await database.execute(
    `INSERT INTO recommendation_candidate_items (recommendation_candidate_id, recipe_id, slot_no, category, dish_score)
     VALUES (?, ?, 1, '荤菜', 80)`, [candidate.insertId, fixture.recipes.recipeX]
  )
  await assert.rejects(database.execute(
    `INSERT INTO recommendation_candidate_items (recommendation_candidate_id, recipe_id, slot_no, category, dish_score)
     VALUES (?, ?, 2, '荤菜', 79)`, [candidate.insertId, fixture.recipes.recipeX]
  ))
  await assert.rejects(database.execute(
    `INSERT INTO recommendation_candidate_items (recommendation_candidate_id, recipe_id, slot_no, category, dish_score)
     VALUES (?, ?, 1, '素菜', 78)`, [candidate.insertId, fixture.recipes.recipeY]
  ))
})

integrationTest('R1 the same Recipe may appear once in each of two Candidates', async () => {
  const [first] = await database.execute(
    `INSERT INTO recommendation_candidates (recommendation_run_id, candidate_rank, estimated_prep_minutes, total_score, score_breakdown)
     VALUES (?, 1, 40, 80, '{}')`, [fixture.runs.runA]
  )
  const [second] = await database.execute(
    `INSERT INTO recommendation_candidates (recommendation_run_id, candidate_rank, estimated_prep_minutes, total_score, score_breakdown)
     VALUES (?, 2, 42, 79, '{}')`, [fixture.runs.runA]
  )
  const sql = `INSERT INTO recommendation_candidate_items (recommendation_candidate_id, recipe_id, slot_no, category, dish_score) VALUES (?, ?, 1, '荤菜', 80)`
  await database.execute(sql, [first.insertId, fixture.recipes.recipeX])
  await database.execute(sql, [second.insertId, fixture.recipes.recipeX])
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM recommendation_candidate_items WHERE recipe_id = ?', [fixture.recipes.recipeX])).count, 2)
})

integrationTest('R1 Candidate Item foreign keys reject unknown Candidate and Recipe', async () => {
  await assert.rejects(database.execute(
    `INSERT INTO recommendation_candidate_items (recommendation_candidate_id, recipe_id, slot_no, category, dish_score)
     VALUES (999999, ?, 1, '荤菜', 80)`, [fixture.recipes.recipeX]
  ))
  const [candidate] = await database.execute(
    `INSERT INTO recommendation_candidates (recommendation_run_id, candidate_rank, estimated_prep_minutes, total_score, score_breakdown)
     VALUES (?, 1, 40, 80, '{}')`, [fixture.runs.runA]
  )
  await assert.rejects(database.execute(
    `INSERT INTO recommendation_candidate_items (recommendation_candidate_id, recipe_id, slot_no, category, dish_score)
     VALUES (?, 999999, 1, '荤菜', 80)`, [candidate.insertId]
  ))
})

integrationTest('R1 physical Recipe deletion is restricted while a Candidate Item references it', async () => {
  const [candidate] = await database.execute(
    `INSERT INTO recommendation_candidates (recommendation_run_id, candidate_rank, estimated_prep_minutes, total_score, score_breakdown)
     VALUES (?, 1, 40, 80, '{}')`, [fixture.runs.runA]
  )
  await database.execute(
    `INSERT INTO recommendation_candidate_items (recommendation_candidate_id, recipe_id, slot_no, category, dish_score)
     VALUES (?, ?, 1, '荤菜', 80)`, [candidate.insertId, fixture.recipes.recipeX]
  )
  await assert.rejects(database.execute('DELETE FROM recipes WHERE id = ?', [fixture.recipes.recipeX]))
})

integrationTest('R1 legacy recommendation_items remains present and unchanged', async () => {
  const columns = await database.execute(
    `SELECT column_name AS column_name FROM information_schema.columns WHERE table_schema = ? AND table_name = 'recommendation_items'`, [testDatabase]
  )
  const names = columns[0].map((row) => row.column_name)
  assert.deepEqual(names.sort(), ['dish_score', 'id', 'reason_text', 'recipe_id', 'recommendation_run_id'].sort())
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM recommendation_items WHERE recommendation_run_id = ?', [fixture.runs.runA])).count, 3)
})
integrationTest('real new-family Starter Recipe initialization is isolated, referentially complete, and transactional', async () => {
  await cleanup()
  await seedStarterIngredients()

  const connection = await database.getConnection()
  let missingIngredientSnapshot
  let failedUser
  try {
    missingIngredientSnapshot = await queryOne('SELECT id, name, calories_per_100g, protein_per_100g, fat_per_100g, carbohydrate_per_100g FROM ingredients WHERE id = 51')
    assert.equal(missingIngredientSnapshot.name, '白菜')
    await connection.execute('DELETE FROM ingredients WHERE id = 51')
    failedUser = await insertUser(connection, 'starter-rollback-user', 'Starter 回滚用户')
  } finally {
    connection.release()
  }

  const failedCreate = await requestAs(failedUser, '/api/families', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Starter 应回滚家庭' })
  })
  assert.equal(failedCreate.status, 500)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM families WHERE name = ?', ['Starter 应回滚家庭'])).count, 0)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM family_members WHERE user_id = ?', [failedUser])).count, 0)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM recipes WHERE family_id NOT IN (SELECT id FROM families)')).count, 0)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM recipe_ingredients WHERE recipe_id NOT IN (SELECT id FROM recipes)')).count, 0)
  assert.equal((await queryOne('SELECT COUNT(*) AS count FROM recipe_tags WHERE recipe_id NOT IN (SELECT id FROM recipes)')).count, 0)

  await database.execute(
    'INSERT INTO ingredients (id, name, calories_per_100g, protein_per_100g, fat_per_100g, carbohydrate_per_100g) VALUES (?, ?, ?, ?, ?, ?)',
    [missingIngredientSnapshot.id, missingIngredientSnapshot.name, missingIngredientSnapshot.calories_per_100g, missingIngredientSnapshot.protein_per_100g, missingIngredientSnapshot.fat_per_100g, missingIngredientSnapshot.carbohydrate_per_100g]
  )

  const userAConnection = await database.getConnection()
  const userA = await insertUser(userAConnection, 'starter-family-user-a', 'Starter 家庭 A 用户')
  userAConnection.release()
  const userBConnection = await database.getConnection()
  const userB = await insertUser(userBConnection, 'starter-family-user-b', 'Starter 家庭 B 用户')
  userBConnection.release()
  const joinConnection = await database.getConnection()
  const joinUser = await insertUser(joinConnection, 'starter-family-join-user', 'Starter 加入用户')
  joinConnection.release()

  const createFamily = async (userId, name) => {
    const response = await requestAs(userId, '/api/families', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name })
    })
    assert.equal(response.status, 201)
    return (await response.json()).data
  }

  const familyA = await createFamily(userA, 'Starter 家庭 A')
  const familyB = await createFamily(userB, 'Starter 家庭 B')
  const ownerA = await queryOne('SELECT id FROM family_members WHERE family_id = ? AND user_id = ?', [familyA.id, userA])
  const ownerB = await queryOne('SELECT id FROM family_members WHERE family_id = ? AND user_id = ?', [familyB.id, userB])

  for (const [familyId, ownerMemberId] of [[familyA.id, ownerA.id], [familyB.id, ownerB.id]]) {
    assert.equal(Number((await queryOne('SELECT COUNT(*) AS count FROM recipes WHERE family_id = ?', [familyId])).count), 48)
    assert.equal(Number((await queryOne('SELECT COUNT(*) AS count FROM recipe_ingredients ri JOIN recipes r ON r.id = ri.recipe_id WHERE r.family_id = ?', [familyId])).count), 103)
    assert.equal(Number((await queryOne('SELECT COUNT(*) AS count FROM recipe_tags rt JOIN recipes r ON r.id = rt.recipe_id WHERE r.family_id = ?', [familyId])).count), 28)
    assert.equal(Number((await queryOne('SELECT COUNT(*) AS count FROM recipes WHERE family_id = ? AND created_by_member_id <> ?', [familyId, ownerMemberId])).count), 0)
    assert.equal(Number((await queryOne('SELECT COUNT(*) AS count FROM recipe_ingredients ri JOIN recipes r ON r.id = ri.recipe_id LEFT JOIN ingredients i ON i.id = ri.ingredient_id WHERE r.family_id = ? AND (r.id IS NULL OR i.id IS NULL)', [familyId])).count), 0)
    assert.equal(Number((await queryOne('SELECT COUNT(*) AS count FROM recipe_tags rt JOIN recipes r ON r.id = rt.recipe_id LEFT JOIN tag_definitions td ON td.id = rt.tag_id WHERE r.family_id = ? AND (r.id IS NULL OR td.id IS NULL OR td.kind <> \'system\')', [familyId])).count), 0)
  }

  const cabbageIngredients = await queryRows(
    `SELECT ri.ingredient_id AS ingredientId, i.name
     FROM recipes r
     JOIN recipe_ingredients ri ON ri.recipe_id = r.id
     JOIN ingredients i ON i.id = ri.ingredient_id
     WHERE r.family_id = ? AND r.title = '醋溜白菜'
     ORDER BY ri.ingredient_id`,
    [familyA.id]
  )
  assert.deepEqual(cabbageIngredients, [{ ingredientId: 13, name: '大蒜' }, { ingredientId: 51, name: '白菜' }])
  assert.equal(cabbageIngredients.some((row) => row.ingredientId === 53), false)

  const recipeIdsA = new Set((await queryRows('SELECT id FROM recipes WHERE family_id = ?', [familyA.id])).map((row) => Number(row.id)))
  const recipeIdsB = new Set((await queryRows('SELECT id FROM recipes WHERE family_id = ?', [familyB.id])).map((row) => Number(row.id)))
  assert.equal([...recipeIdsA].some((recipeId) => recipeIdsB.has(recipeId)), false)

  const joinResponse = await requestAs(joinUser, '/api/families/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ inviteCode: familyA.invite_code })
  })
  assert.equal(joinResponse.status, 201)
  assert.equal(Number((await queryOne('SELECT COUNT(*) AS count FROM recipes WHERE family_id = ?', [familyA.id])).count), 48)
  assert.equal(Number((await queryOne('SELECT COUNT(*) AS count FROM family_members WHERE family_id = ? AND user_id = ?', [familyA.id, joinUser])).count), 1)
})
