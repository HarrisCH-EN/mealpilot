const MODE_WEIGHTS = {
  balanced: { preference: 30, nutrition: 30, season: 20, time: 20 },
  healthy: { preference: 25, nutrition: 40, season: 20, time: 15 },
  quick: { preference: 30, nutrition: 15, season: 20, time: 35 }
}

function dishMatchesRestriction(dish, restrictedIngredientIds) {
  const dishIngredients = dish.ingredientIds || dish.restrictedIngredientIds || []
  return dishIngredients.some((id) => restrictedIngredientIds.includes(id))
}

function scoreDish(dish, month, maxCookMinutes, weights) {
  const isSeasonal = (dish.seasonalMonths || []).includes(month)
  const season = isSeasonal ? 100 : 35
  const preference = Number(dish.preferenceScore || 70)
  const nutrition = Math.min(100, (Number(dish.nutrition?.protein || 0) * 2) + (Number(dish.nutrition?.vegetables || 0) * 20) + 35)
  const time = Math.max(0, 100 - Math.round((Number(dish.cookMinutes || 0) / Math.max(maxCookMinutes, 1)) * 100) - (Number(dish.difficulty || 1) - 1) * 8)

  return {
    total: Math.round((season * weights.season + preference * weights.preference + nutrition * weights.nutrition + time * weights.time) / 100),
    parts: { season, preference, nutrition, time },
    reason: [
      isSeasonal ? '主要食材当季' : '食材非当季，作为备选',
      preference >= 75 ? '符合成员偏好' : '成员接受度适中',
      `烹饪约 ${dish.cookMinutes} 分钟`
    ].join('；')
  }
}

function categoryRequirements(peopleCount) {
  if (peopleCount <= 2) return ['荤菜', '素菜', '汤']
  if (peopleCount <= 4) return ['荤菜', '素菜', '素菜', '汤']
  return ['荤菜', '荤菜', '素菜', '素菜', '汤']
}

function buildRecommendation({ dishes, restrictedIngredientIds = [], month, peopleCount, maxCookMinutes, mode = 'balanced' }) {
  const weights = MODE_WEIGHTS[mode] || MODE_WEIGHTS.balanced
  const candidates = dishes
    .filter((dish) => !dishMatchesRestriction(dish, restrictedIngredientIds))
    .map((dish) => ({ ...dish, score: scoreDish(dish, month, maxCookMinutes, weights) }))
    .sort((left, right) => right.score.total - left.score.total || left.cookMinutes - right.cookMinutes)

  const selectedIds = new Set()
  const items = []
  for (const category of categoryRequirements(peopleCount)) {
    const candidate = candidates.find((dish) => dish.category === category && !selectedIds.has(dish.id))
    if (!candidate) {
      return { ok: false, message: `菜谱库缺少可用的${category}，请补充菜谱或调整忌口`, items: [] }
    }
    selectedIds.add(candidate.id)
    items.push(candidate)
  }

  const totalCookMinutes = items.reduce((total, item) => total + Number(item.cookMinutes || 0), 0)
  if (totalCookMinutes > maxCookMinutes) {
    return { ok: false, message: '没有符合最大总耗时的菜单组合，请放宽时长限制', items: [] }
  }

  const average = (key) => Math.round(items.reduce((total, item) => total + item.score.parts[key], 0) / items.length)
  return {
    ok: true,
    items,
    totalCookMinutes,
    totalScore: Math.round(items.reduce((total, item) => total + item.score.total, 0) / items.length),
    scoreBreakdown: {
      season: average('season'),
      preference: average('preference'),
      nutrition: average('nutrition'),
      time: average('time')
    }
  }
}

module.exports = { MODE_WEIGHTS, buildRecommendation }
