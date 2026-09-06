const MEALS = [
  { mealType: 'breakfast', mealTypeLabel: '早餐' },
  { mealType: 'lunch', mealTypeLabel: '午餐' },
  { mealType: 'dinner', mealTypeLabel: '晚餐' }
]

function pad(value) {
  return String(value).padStart(2, '0')
}

function toLocalISODate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseLocalDate(value) {
  const [year, month, day] = String(value).split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

function shiftDate(value, offset) {
  const date = parseLocalDate(value)
  date.setDate(date.getDate() + Number(offset))
  return toLocalISODate(date)
}

function buildRecipePath(keyword, category) {
  const query = []
  if (String(keyword || '').trim()) query.push(`keyword=${encodeURIComponent(String(keyword).trim())}`)
  if (category && category !== '全部') query.push(`category=${encodeURIComponent(category)}`)
  return `/recipes${query.length ? `?${query.join('&')}` : ''}`
}

function buildMenuItemPayload(recipeId, menuDate, mealType, note = '') {
  return {
    recipeId: Number(recipeId),
    menuDate,
    mealType,
    note: String(note || '').trim()
  }
}

function normalizeMeals(rows = []) {
  const byType = new Map(rows.map((item) => [item.mealType, item]))
  return MEALS.map((meal) => {
    const current = byType.get(meal.mealType) || {}
    return { ...meal, ...current, items: current.items || [] }
  })
}

function serializeIngredients(rows = []) {
  return rows
    .filter((item) => item.ingredientId && Number(item.amountGrams) > 0)
    .map((item) => ({
      ingredientId: Number(item.ingredientId),
      amountGrams: Number(item.amountGrams),
      note: String(item.note || '').trim()
    }))
}

function parseRecipeSteps(value = '', startKey = 1) {
  const steps = String(value || '')
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => ({ key: `step-${Number(startKey) + index}`, text }))
  return steps.length ? steps : [{ key: `step-${Number(startKey)}`, text: '' }]
}

function serializeRecipeSteps(rows = []) {
  return rows
    .map((item) => String(item && item.text || '').trim())
    .filter(Boolean)
    .join('\n')
}

function normalizeFavoriteRecipeIds(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  return value.reduce((result, item) => {
    const id = Number(item)
    if (Number.isInteger(id) && id > 0 && !seen.has(id)) {
      seen.add(id)
      result.push(id)
    }
    return result
  }, [])
}

function toggleFavoriteRecipeId(value, recipeId) {
  const ids = normalizeFavoriteRecipeIds(value)
  const id = Number(recipeId)
  if (!Number.isInteger(id) || id <= 0) return ids
  return ids.includes(id) ? ids.filter((item) => item !== id) : ids.concat(id)
}

function difficultyLabel(value) {
  return ({ 1: '简单', 2: '适中', 3: '进阶' })[Number(value)] || '适中'
}

module.exports = {
  MEALS,
  buildMenuItemPayload,
  buildRecipePath,
  difficultyLabel,
  normalizeMeals,
  normalizeFavoriteRecipeIds,
  parseLocalDate,
  parseRecipeSteps,
  serializeIngredients,
  serializeRecipeSteps,
  shiftDate,
  toggleFavoriteRecipeId,
  toLocalISODate
}
