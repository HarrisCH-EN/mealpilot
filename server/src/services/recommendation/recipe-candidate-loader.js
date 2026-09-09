function rowsFrom(result) {
  return Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result
}

function baseRecipe(row) {
  return {
    id: Number(row.id ?? row.recipeId),
    familyId: Number(row.familyId ?? row.family_id),
    status: row.status,
    title: row.title,
    description: row.description,
    steps: row.steps,
    coverUrl: row.coverUrl ?? row.cover_url ?? null,
    category: row.category,
    cookMinutes: Number(row.cookMinutes ?? row.cook_minutes ?? 0),
    difficulty: Number(row.difficulty ?? 1),
    servings: Number(row.servings ?? 1),
    ingredients: [],
    tagIds: [],
    tagDetails: [],
    tags: { taste: [], dietary: [], method: [] }
  }
}

async function loadRecipeDomainData(connection, { familyId }) {
  const recipeRows = rowsFrom(await connection.execute(`
    SELECT r.id, r.family_id AS familyId, r.status, r.title, r.description, r.steps,
           r.cover_url AS coverUrl, r.category, r.cook_minutes AS cookMinutes,
           r.difficulty, r.servings
    FROM recipes r
    WHERE r.family_id = ? AND r.status = 'active'
    ORDER BY r.id ASC
  `, [familyId]))
  if (!recipeRows.length) return []
  const recipes = new Map(recipeRows.map((row) => [Number(row.id), baseRecipe(row)]))
  const recipeIds = [...recipes.keys()]
  const placeholders = recipeIds.map(() => '?').join(',')
  const ingredientRows = rowsFrom(await connection.execute(`
    SELECT ri.recipe_id AS recipeId, ri.ingredient_id AS ingredientId, ri.amount_grams AS amountGrams,
           i.name AS ingredientName, i.calories_per_100g AS caloriesPer100g,
           i.protein_per_100g AS proteinPer100g, i.fat_per_100g AS fatPer100g,
           i.carbohydrate_per_100g AS carbohydratePer100g
    FROM recipe_ingredients ri
    INNER JOIN ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recipe_id IN (${placeholders})
    ORDER BY ri.recipe_id, ri.ingredient_id
  `, recipeIds))
  const ingredientIds = new Set()
  for (const row of ingredientRows) {
    const item = {
      ingredientId: Number(row.ingredientId),
      ingredientName: row.ingredientName,
      amountGrams: Number(row.amountGrams),
      caloriesPer100g: Number(row.caloriesPer100g),
      proteinPer100g: Number(row.proteinPer100g),
      fatPer100g: Number(row.fatPer100g),
      carbohydratePer100g: Number(row.carbohydratePer100g),
      seasonalMonths: []
    }
    if (recipes.has(Number(row.recipeId))) recipes.get(Number(row.recipeId)).ingredients.push(item)
    ingredientIds.add(Number(row.ingredientId))
  }
  let tagRows
  try {
    tagRows = rowsFrom(await connection.execute(`
      SELECT rt.recipe_id AS recipeId, td.id AS tagId, td.code AS tagCode, td.name AS tagName, td.kind AS tagKind
      FROM recipe_tags rt
      INNER JOIN tag_definitions td ON td.id = rt.tag_id
      WHERE rt.recipe_id IN (${placeholders})
        AND td.status = 'active'
        AND (td.family_id IS NULL OR td.family_id = ?)
      ORDER BY rt.recipe_id, td.kind, td.code, td.id
    `, [...recipeIds, familyId]))
  } catch (error) {
    // Keep the loader readable by databases that have not applied the V1 tag
    // migration yet.  The fallback is only a compatibility bridge; new
    // writes and the canonical schema use tag_definitions + tag_id.
    if (!['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) throw error
    tagRows = rowsFrom(await connection.execute(`
      SELECT recipe_id AS recipeId, tag_type AS tagType, tag_value AS tagValue
      FROM recipe_tags
      WHERE recipe_id IN (${placeholders})
      ORDER BY recipe_id, tag_type, tag_value
    `, recipeIds))
  }
  for (const row of tagRows) {
    const recipe = recipes.get(Number(row.recipeId))
    if (!recipe) continue
    if (row.tagId !== undefined && row.tagId !== null) {
      const tagId = Number(row.tagId)
      if (!recipe.tagIds.includes(tagId)) recipe.tagIds.push(tagId)
      recipe.tagDetails.push({ id: tagId, code: row.tagCode || null, name: row.tagName || null, kind: row.tagKind || null })
    }
    if (row.tagType && recipe.tags[row.tagType]) {
      recipe.tags[row.tagType].push(row.tagValue)
      continue
    }
    const tagGroup = {
      spicy: 'taste',
      sour: 'taste',
      sweet: 'taste',
      seafood: 'dietary',
      fish: 'dietary',
      shrimp: 'dietary',
      crab: 'dietary',
      bake: 'method',
      steam: 'method',
      fried: 'method'
    }[row.tagCode]
    if (tagGroup) recipe.tags[tagGroup].push(row.tagCode)
  }
  if (ingredientIds.size) {
    const ingredientPlaceholders = [...ingredientIds].map(() => '?').join(',')
    const seasonRows = rowsFrom(await connection.execute(`
      SELECT ingredient_id AS ingredientId, month
      FROM ingredient_seasons
      WHERE ingredient_id IN (${ingredientPlaceholders})
      ORDER BY ingredient_id, month
    `, [...ingredientIds]))
    const seasons = new Map()
    for (const row of seasonRows) {
      const id = Number(row.ingredientId)
      if (!seasons.has(id)) seasons.set(id, [])
      seasons.get(id).push(Number(row.month))
    }
    for (const recipe of recipes.values()) {
      for (const item of recipe.ingredients) item.seasonalMonths = seasons.get(item.ingredientId) || []
    }
  }
  return [...recipes.values()]
}

async function loadActiveFamilyRestrictionIds(connection, { familyId }) {
  const [rows] = await connection.execute(`
    SELECT DISTINCT mir.ingredient_id AS ingredientId
    FROM family_members fm
    INNER JOIN member_ingredient_restrictions mir ON mir.member_id = fm.id
    WHERE fm.family_id = ? AND fm.status = 'active'
  `, [familyId])
  return rows.map((row) => Number(row.ingredientId))
}

async function loadFamilyCategoryPreferenceScores(connection, { familyId }) {
  const [rows] = await connection.execute(`
    SELECT fm.id AS memberId, mcp.category, mcp.preference_score AS preferenceScore
    FROM family_members fm
    LEFT JOIN member_category_preferences mcp ON mcp.member_id = fm.id
    WHERE fm.family_id = ? AND fm.status = 'active'
  `, [familyId])
  const memberIds = new Set(rows.map((row) => Number(row.memberId)))
  const categories = ['荤菜', '素菜', '汤', '主食']
  return Object.fromEntries(categories.map((category) => {
    const values = [...memberIds].map((memberId) => {
      const row = rows.find((candidate) => Number(candidate.memberId) === memberId && candidate.category === category)
      return row && Number.isFinite(Number(row.preferenceScore)) ? Number(row.preferenceScore) : 3
    })
    return [category, values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 3]
  }))
}

module.exports = { loadActiveFamilyRestrictionIds, loadFamilyCategoryPreferenceScores, loadRecipeDomainData }
