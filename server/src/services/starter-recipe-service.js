const starterRecipes = require('../data/starter-recipes')

const RECIPE_CATEGORIES = new Set(['荤菜', '素菜', '汤', '主食'])

function fail(message) {
  const error = new Error(message)
  error.code = 'STARTER_RECIPE_INITIALIZATION_FAILED'
  return error
}

function assertPositiveId(value, label) {
  if (!Number.isInteger(Number(value)) || Number(value) <= 0) throw fail(`${label}不合法`)
}

function validateTemplates() {
  if (starterRecipes.length !== 48) throw fail('Starter Recipe 模板数量必须为48')
  for (const recipe of starterRecipes) {
    if (!recipe.title || !RECIPE_CATEGORIES.has(recipe.category)) throw fail(`Starter Recipe 模板不合法：${recipe.title || '未命名'}`)
    if (!Array.isArray(recipe.ingredients) || !recipe.ingredients.length) throw fail(`Starter Recipe 缺少食材：${recipe.title}`)
    for (const ingredient of recipe.ingredients) {
      assertPositiveId(ingredient.ingredientId, `Starter Recipe 食材编号：${recipe.title}`)
      if (!(Number(ingredient.amountGrams) > 0)) throw fail(`Starter Recipe 食材用量不合法：${recipe.title}`)
    }
    if (!Array.isArray(recipe.systemTagCodes)) throw fail(`Starter Recipe 标签不合法：${recipe.title}`)
  }
}

async function queryExistingIds(connection, table, ids) {
  if (!ids.length) return new Map()
  const placeholders = ids.map(() => '?').join(', ')
  const [rows] = await connection.execute(`SELECT id FROM ${table} WHERE id IN (${placeholders})`, ids)
  return new Map(rows.map((row) => [Number(row.id), row.id]))
}

async function querySystemTags(connection, codes) {
  if (!codes.length) return new Map()
  const placeholders = codes.map(() => '?').join(', ')
  const [rows] = await connection.execute(
    `SELECT id, code FROM tag_definitions
     WHERE kind = 'system' AND status = 'active' AND code IN (${placeholders})`,
    codes
  )
  return new Map(rows.map((row) => [row.code, row.id]))
}

async function seedStarterRecipes(connection, { familyId, ownerMemberId }) {
  if (!connection || typeof connection.execute !== 'function') throw fail('缺少事务数据库连接')
  assertPositiveId(familyId, '家庭编号')
  assertPositiveId(ownerMemberId, '家庭成员编号')
  validateTemplates()

  const ingredientIds = [...new Set(starterRecipes.flatMap((recipe) => recipe.ingredients.map((ingredient) => Number(ingredient.ingredientId))))]
  const existingIngredients = await queryExistingIds(connection, 'ingredients', ingredientIds)
  const missingIngredientIds = ingredientIds.filter((id) => !existingIngredients.has(id))
  if (missingIngredientIds.length) throw fail(`Starter Recipe 所需食材不存在：${missingIngredientIds.join(',')}`)

  const tagCodes = [...new Set(starterRecipes.flatMap((recipe) => recipe.systemTagCodes))]
  const systemTags = await querySystemTags(connection, tagCodes)
  const missingTagCodes = tagCodes.filter((code) => !systemTags.has(code))
  if (missingTagCodes.length) throw fail(`Starter Recipe 所需系统标签不存在：${missingTagCodes.join(',')}`)

  const recipeIds = []
  let ingredientCount = 0
  let tagCount = 0
  for (const recipe of starterRecipes) {
    const [inserted] = await connection.execute(
      `INSERT INTO recipes
       (family_id, created_by_member_id, title, category, description, steps, cook_minutes, difficulty, servings, cover_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [familyId, ownerMemberId, recipe.title, recipe.category, recipe.description, recipe.steps, recipe.cookMinutes, recipe.difficulty, recipe.servings, recipe.coverUrl]
    )
    if (!inserted || !inserted.insertId) throw fail(`Starter Recipe 插入失败：${recipe.title}`)
    const recipeId = inserted.insertId
    recipeIds.push(recipeId)

    for (const ingredient of recipe.ingredients) {
      await connection.execute(
        'INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount_grams, note) VALUES (?, ?, ?, ?)',
        [recipeId, ingredient.ingredientId, ingredient.amountGrams, ingredient.note]
      )
      ingredientCount += 1
    }

    for (const code of recipe.systemTagCodes) {
      await connection.execute(
        'INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)',
        [recipeId, systemTags.get(code)]
      )
      tagCount += 1
    }
  }

  return { recipeIds, recipeCount: recipeIds.length, recipeIngredientCount: ingredientCount, recipeTagCount: tagCount }
}

module.exports = { seedStarterRecipes }
