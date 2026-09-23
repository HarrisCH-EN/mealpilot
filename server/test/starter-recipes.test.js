const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { router } = require('../src/routes/families')
const starterRecipes = require('../src/data/starter-recipes')
const { seedStarterRecipes } = require('../src/services/starter-recipe-service')
const { systemRecipeCovers } = require('../src/data/system-recipe-covers')

const owner = { id: 42, openid: 'wechat-owner', display_name: '真实微信用户', avatar_url: '' }
const systemTagDefinitions = [
  'spicy', 'sour', 'sweet', 'seafood', 'fish', 'shrimp', 'crab', 'bake', 'steam', 'fried'
].map((code, index) => ({ id: 700 + index, code, kind: 'system', status: 'active' }))

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function makeDatabase({ families = [], memberships = [], missingIngredientIds = [], failOnRecipeIngredientAt = null } = {}) {
  const state = {
    families: clone(families),
    memberships: clone(memberships),
    ingredients: Array.from({ length: 53 }, (_, index) => ({ id: index + 1 })).filter((row) => !missingIngredientIds.includes(row.id)),
    tagDefinitions: clone(systemTagDefinitions),
    recipes: [],
    recipeIngredients: [],
    recipeTags: [],
    nextFamilyId: 900,
    nextMemberId: 901,
    nextRecipeId: 1000,
    recipeIngredientInserts: 0,
    committed: false,
    rolledBack: false,
    transactionSnapshot: null
  }

  function currentMembershipRows(userId) {
    return state.memberships
      .filter((member) => member.user_id === userId && member.status === 'active')
      .map((member) => {
        const family = state.families.find((item) => item.id === member.family_id)
        return {
          member_id: member.id,
          family_id: member.family_id,
          role: member.role,
          nickname: member.nickname,
          family_name: family.name,
          invite_code: family.invite_code
        }
      })
  }

  async function execute(sql, params = []) {
    if (/SELECT id FROM users WHERE id = \? FOR UPDATE/i.test(sql)) return [[{ id: params[0] }]]
    if (/FROM family_members fm JOIN families f/i.test(sql)) return [currentMembershipRows(params[0])]
    if (/SELECT id FROM ingredients WHERE id IN/i.test(sql)) {
      return [state.ingredients.filter((ingredient) => params.includes(ingredient.id))]
    }
    if (/SELECT id, code FROM tag_definitions/i.test(sql)) {
      return [state.tagDefinitions.filter((tag) => params.includes(tag.code))]
    }
    if (/INSERT INTO families/i.test(sql)) {
      const [name, inviteCode, ownerUserId] = params
      const family = { id: state.nextFamilyId++, name, invite_code: inviteCode, admin_user_id: ownerUserId }
      state.families.push(family)
      return [{ insertId: family.id }]
    }
    if (/INSERT INTO family_members/i.test(sql)) {
      const [familyId, userId, nickname] = params
      const member = { id: state.nextMemberId++, family_id: familyId, user_id: userId, role: /'admin'/i.test(sql) ? 'admin' : 'member', nickname, status: 'active' }
      state.memberships.push(member)
      return [{ insertId: member.id, affectedRows: 1 }]
    }
    if (/INSERT INTO recipes/i.test(sql)) {
      const [familyId, ownerMemberId, title, category, description, steps, cookMinutes, difficulty, servings, coverUrl] = params
      const recipe = { id: state.nextRecipeId++, family_id: familyId, created_by_member_id: ownerMemberId, title, category, description, steps, cook_minutes: cookMinutes, difficulty, servings, cover_url: coverUrl, status: 'active' }
      state.recipes.push(recipe)
      return [{ insertId: recipe.id, affectedRows: 1 }]
    }
    if (/INSERT INTO recipe_ingredients/i.test(sql)) {
      state.recipeIngredientInserts += 1
      if (failOnRecipeIngredientAt && state.recipeIngredientInserts === failOnRecipeIngredientAt) throw new Error('simulated starter ingredient failure')
      const [recipeId, ingredientId, amountGrams, note] = params
      state.recipeIngredients.push({ recipe_id: recipeId, ingredient_id: ingredientId, amount_grams: amountGrams, note })
      return [{ affectedRows: 1 }]
    }
    if (/INSERT INTO recipe_tags/i.test(sql)) {
      const [recipeId, tagId] = params
      state.recipeTags.push({ recipe_id: recipeId, tag_id: tagId })
      return [{ affectedRows: 1 }]
    }
    if (/SELECT id FROM families WHERE invite_code =/i.test(sql)) {
      const family = state.families.find((item) => item.invite_code === params[0])
      return [family ? [{ id: family.id }] : []]
    }
    if (/SELECT id, status FROM family_members WHERE family_id = \? AND user_id = \? FOR UPDATE/i.test(sql)) {
      const member = state.memberships.find((item) => item.family_id === params[0] && item.user_id === params[1])
      return [member ? [{ id: member.id, status: member.status }] : []]
    }
    if (/UPDATE family_members SET status = 'active'/i.test(sql)) {
      const [nickname, memberId] = params
      const member = state.memberships.find((item) => item.id === Number(memberId))
      if (member) Object.assign(member, { nickname, role: 'member', status: 'active' })
      return [{ affectedRows: member ? 1 : 0 }]
    }
    if (/SELECT id, name, invite_code, admin_user_id, created_at AS createdAt FROM families WHERE id =/i.test(sql)) {
      const family = state.families.find((item) => item.id === params[0])
      return [family ? [family] : []]
    }
    throw new Error(`Unexpected SQL: ${sql}`)
  }

  return {
    state,
    execute,
    getConnection: async () => {
      const connection = {
        beginTransaction: async () => {
          state.transactionSnapshot = clone({
            families: state.families,
            memberships: state.memberships,
            recipes: state.recipes,
            recipeIngredients: state.recipeIngredients,
            recipeTags: state.recipeTags,
            nextFamilyId: state.nextFamilyId,
            nextMemberId: state.nextMemberId,
            nextRecipeId: state.nextRecipeId,
            recipeIngredientInserts: state.recipeIngredientInserts
          })
        },
        commit: async () => { state.committed = true; state.transactionSnapshot = null },
        rollback: async () => {
          state.rolledBack = true
          if (state.transactionSnapshot) Object.assign(state, clone(state.transactionSnapshot))
          state.transactionSnapshot = null
        },
        release: () => {},
        execute
      }
      return connection
    }
  }
}

function makeApp(database, { seed = seedStarterRecipes, actor = owner } = {}) {
  const app = express()
  app.use(express.json())
  app.use('/api', router({
    database,
    jwtSecret: 'test-secret',
    devAuthEnabled: false,
    auth: (request, _response, next) => { request.user = actor; next() },
    family: (_request, _response, next) => next(),
    familyAdmin: (_request, _response, next) => next(),
    seedStarterRecipes: async (connection, params) => seed(connection, { ...params, fileIdForPath: (cloudPath) => `cloud://test.bucket/${cloudPath}` })
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

async function post(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  return { response, body: await response.json() }
}

test('new family receives 48 independent starter recipes with exact seed relationships', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database), async (baseUrl) => {
    const result = await post(baseUrl, '/api/families', { name: 'Starter 家庭' })
    assert.equal(result.response.status, 201, result.body.message || JSON.stringify(result.body))
    assert.equal(result.body.data.id, 900)
  })

  assert.equal(database.state.families.length, 1)
  assert.equal(database.state.memberships.length, 1)
  assert.equal(database.state.recipes.length, 48)
  assert.equal(new Set(database.state.recipes.map((recipe) => recipe.id)).size, 48)
  assert.deepEqual([...new Set(database.state.recipes.map((recipe) => recipe.family_id))], [900])
  assert.deepEqual([...new Set(database.state.recipes.map((recipe) => recipe.created_by_member_id))], [901])

  const cabbageRecipe = starterRecipes.find((recipe) => recipe.title === '醋溜白菜')
  assert.ok(cabbageRecipe.ingredients.some((ingredient) => ingredient.ingredientId === 51))
  assert.equal(cabbageRecipe.ingredients.some((ingredient) => ingredient.ingredientId === 53), false)

  const tagIdByCode = new Map(systemTagDefinitions.map((tag) => [tag.code, tag.id]))
  const actualRecipeIds = database.state.recipes.map((recipe) => recipe.id)
  assert.deepEqual(actualRecipeIds, Array.from({ length: 48 }, (_, index) => 1000 + index))
  assert.equal(database.state.recipeIngredients.length, starterRecipes.reduce((count, recipe) => count + recipe.ingredients.length, 0))
  assert.equal(database.state.recipeTags.length, starterRecipes.reduce((count, recipe) => count + recipe.systemTagCodes.length, 0))

  for (const [index, template] of starterRecipes.entries()) {
    const recipe = database.state.recipes[index]
    assert.deepEqual(recipe, {
      id: 1000 + index,
      family_id: 900,
      created_by_member_id: 901,
      title: template.title,
      category: template.category,
      description: template.description,
      steps: template.steps,
      cook_minutes: template.cookMinutes,
      difficulty: template.difficulty,
      servings: template.servings,
      cover_url: systemRecipeCovers[template.title] ? `cloud://test.bucket/${systemRecipeCovers[template.title]}` : '',
      status: 'active'
    })

    assert.deepEqual(
      database.state.recipeIngredients.filter((row) => row.recipe_id === recipe.id).map((row) => ({ ingredientId: row.ingredient_id, amountGrams: row.amount_grams, note: row.note })),
      template.ingredients
    )
    assert.deepEqual(
      database.state.recipeTags.filter((row) => row.recipe_id === recipe.id).map((row) => row.tag_id),
      template.systemTagCodes.map((code) => tagIdByCode.get(code))
    )
  }
})

test('joining an existing family does not initialize starter recipes', async () => {
  const existingFamily = { id: 10, name: '已有家庭', invite_code: 'ABC123', admin_user_id: 7 }
  const database = makeDatabase({ families: [existingFamily] })
  let seedCalls = 0
  await withServer(makeApp(database, { seed: async () => { seedCalls += 1 } }), async (baseUrl) => {
    const result = await post(baseUrl, '/api/families/join', { inviteCode: existingFamily.invite_code })
    assert.equal(result.response.status, 201)
  })
  assert.equal(seedCalls, 0)
  assert.equal(database.state.recipes.length, 0)
  assert.equal(database.state.memberships.length, 1)
})

test('starter initialization failure rolls back family, owner member, and recipes together', async () => {
  const database = makeDatabase({ failOnRecipeIngredientAt: 1 })
  await withServer(makeApp(database), async (baseUrl) => {
    const result = await post(baseUrl, '/api/families', { name: '应回滚家庭' })
    assert.equal(result.response.status, 500)
  })
  assert.equal(database.state.committed, false)
  assert.equal(database.state.rolledBack, true)
  assert.deepEqual(database.state.families, [])
  assert.deepEqual(database.state.memberships, [])
  assert.deepEqual(database.state.recipes, [])
  assert.deepEqual(database.state.recipeIngredients, [])
  assert.deepEqual(database.state.recipeTags, [])
})

test('starter service validates all ingredients and system tags before inserting recipes and never controls the transaction', async () => {
  const missingIngredientDatabase = makeDatabase({ missingIngredientIds: [53] })
  const missingIngredientConnection = await missingIngredientDatabase.getConnection()
  await missingIngredientConnection.beginTransaction()
  await assert.rejects(
    () => seedStarterRecipes(missingIngredientConnection, { familyId: 900, adminMemberId: 901 }),
    (error) => error.code === 'STARTER_RECIPE_INITIALIZATION_FAILED' && /53/.test(error.message)
  )
  assert.equal(missingIngredientDatabase.state.recipes.length, 0)
  assert.equal(missingIngredientDatabase.state.committed, false)
  assert.equal(missingIngredientDatabase.state.rolledBack, false)

  const missingTagDatabase = makeDatabase()
  missingTagDatabase.state.tagDefinitions = missingTagDatabase.state.tagDefinitions.filter((tag) => tag.code !== 'sweet')
  const missingTagConnection = await missingTagDatabase.getConnection()
  await missingTagConnection.beginTransaction()
  await assert.rejects(
    () => seedStarterRecipes(missingTagConnection, { familyId: 900, adminMemberId: 901 }),
    (error) => error.code === 'STARTER_RECIPE_INITIALIZATION_FAILED' && /sweet/.test(error.message)
  )
  assert.equal(missingTagDatabase.state.recipes.length, 0)
  assert.equal(missingTagDatabase.state.committed, false)
  assert.equal(missingTagDatabase.state.rolledBack, false)
})

