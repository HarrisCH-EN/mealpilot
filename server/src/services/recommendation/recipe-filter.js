const { CATEGORY_BY_SLOT } = require('./constants')

function recipeIngredientIds(recipe) {
  if (Array.isArray(recipe.ingredients)) return recipe.ingredients.map((item) => Number(item.ingredientId)).filter(Number.isInteger)
  return Array.isArray(recipe.ingredientIds) ? recipe.ingredientIds.map(Number).filter(Number.isInteger) : []
}

function filterEligibleRecipes(recipes, { familyId, restrictedIngredientIds = [] } = {}) {
  const pools = { meat: [], vegetable: [], soup: [], staple: [] }
  const excluded = { family: 0, inactive: 0, restricted: 0, category: 0 }
  const restricted = new Set(restrictedIngredientIds.map(Number))
  const categoryToSlot = Object.fromEntries(Object.entries(CATEGORY_BY_SLOT).map(([slot, category]) => [category, slot]))
  for (const recipe of recipes || []) {
    if (Number(recipe.familyId ?? recipe.family_id) !== Number(familyId)) {
      excluded.family += 1
      continue
    }
    if (recipe.status !== 'active') {
      excluded.inactive += 1
      continue
    }
    if (recipeIngredientIds(recipe).some((id) => restricted.has(id))) {
      excluded.restricted += 1
      continue
    }
    const slot = categoryToSlot[recipe.category]
    if (!slot) {
      excluded.category += 1
      continue
    }
    pools[slot].push(recipe)
  }
  for (const pool of Object.values(pools)) pool.sort((left, right) => Number(left.id) - Number(right.id))
  return {
    pools,
    counts: Object.fromEntries(Object.entries(pools).map(([key, value]) => [key, value.length])),
    excluded
  }
}

module.exports = { filterEligibleRecipes, recipeIngredientIds }
