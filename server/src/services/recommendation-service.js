const MODE_WEIGHTS = {
  balanced: { preference: 30, nutrition: 30, season: 20, time: 20 },
  healthy: { preference: 25, nutrition: 40, season: 20, time: 15 },
  quick: { preference: 30, nutrition: 15, season: 20, time: 35 }
}

const PREFERENCE_BASE_SCORE = 70
const PREFERENCE_WEIGHT = 8
const CATEGORY_VALUES = ['荤菜', '素菜', '汤', '主食']

function aggregateFamilyPreferences(rows = []) {
  const memberIds = new Set(rows.filter((row) => row.memberId != null).map((row) => Number(row.memberId)))
  const totals = Object.fromEntries(CATEGORY_VALUES.map((category) => [category, memberIds.size * 3]))
  const seen = new Set()
  for (const row of rows) {
    if (!CATEGORY_VALUES.includes(row.category) || row.memberId == null) continue
    const key = `${row.memberId}:${row.category}`
    if (seen.has(key)) continue
    seen.add(key)
    const score = Number(row.preferenceScore)
    if (Number.isFinite(score) && score >= 1 && score <= 5) totals[row.category] += score - 3
  }
  return Object.fromEntries(CATEGORY_VALUES.map((category) => [category, memberIds.size ? totals[category] / memberIds.size : 3]))
}

function dishMatchesRestriction(dish, restrictedIngredientIds) {
  const dishIngredients = dish.ingredientIds || dish.restrictedIngredientIds || []
  return dishIngredients.some((id) => restrictedIngredientIds.includes(id))
}

function scoreDish(dish, month, maxCookMinutes, weights, familyPreferenceScore, hasFamilyPreferences) {
  const isSeasonal = (dish.seasonalMonths || []).includes(month)
  const season = isSeasonal ? 100 : 35
  const preference = familyPreferenceScore === undefined
    ? Number(dish.preferenceScore || PREFERENCE_BASE_SCORE)
    : PREFERENCE_BASE_SCORE + (Number(familyPreferenceScore) - 3) * PREFERENCE_WEIGHT
  const nutrition = Math.min(100, (Number(dish.nutrition?.protein || 0) * 2) + (Number(dish.nutrition?.vegetables || 0) * 20) + 35)
  const time = Math.max(0, 100 - Math.round((Number(dish.cookMinutes || 0) / Math.max(maxCookMinutes, 1)) * 100) - (Number(dish.difficulty || 1) - 1) * 8)
  const preferenceReason = familyPreferenceScore === undefined
    ? '成员接受度适中'
    : !hasFamilyPreferences
      ? `家庭未设置${dish.category}偏好，按中性评分`
      : familyPreferenceScore > 3
        ? `家庭更偏好${dish.category}`
        : familyPreferenceScore < 3
          ? `家庭较少偏好${dish.category}`
          : `家庭对${dish.category}偏好中性`

  return {
    total: Math.round((season * weights.season + preference * weights.preference + nutrition * weights.nutrition + time * weights.time) / 100),
    parts: { season, preference, nutrition, time },
    reason: [
      isSeasonal ? '主要食材当季' : '食材非当季，作为备选',
      preferenceReason,
      `烹饪约 ${dish.cookMinutes} 分钟`
    ].join('；')
  }
}

function categoryRequirements(peopleCount) {
  if (peopleCount <= 2) return ['荤菜', '素菜', '汤']
  if (peopleCount <= 4) return ['荤菜', '素菜', '素菜', '汤']
  return ['荤菜', '荤菜', '素菜', '素菜', '汤']
}

function totalCookMinutes(items) {
  return items.reduce((total, item) => total + Number(item.cookMinutes || 0), 0)
}

function averageScore(items, key) {
  return Math.round(items.reduce((total, item) => total + item.score.parts[key], 0) / items.length)
}

function menuQuality(items) {
  return Math.round(items.reduce((total, item) => total + item.score.total, 0) / items.length)
}

function isBetterMenu(candidate, current, maxCookMinutes) {
  if (!current) return true
  const candidateWithinLimit = candidate.totalCookMinutes <= maxCookMinutes
  const currentWithinLimit = current.totalCookMinutes <= maxCookMinutes
  if (candidateWithinLimit !== currentWithinLimit) return candidateWithinLimit
  if (candidate.totalScore !== current.totalScore) return candidate.totalScore > current.totalScore
  return candidate.totalCookMinutes < current.totalCookMinutes
}

function findBestMenu(candidates, requirements, maxCookMinutes) {
  let best = null

  function visit(index, selectedIds, items) {
    if (index === requirements.length) {
      const totalMinutes = totalCookMinutes(items)
      const candidate = {
        items: [...items],
        totalCookMinutes: totalMinutes,
        totalScore: menuQuality(items)
      }
      if (isBetterMenu(candidate, best, maxCookMinutes)) best = candidate
      return
    }

    const category = requirements[index]
    for (const dish of candidates) {
      if (dish.category !== category || selectedIds.has(dish.id)) continue
      selectedIds.add(dish.id)
      items.push(dish)
      visit(index + 1, selectedIds, items)
      items.pop()
      selectedIds.delete(dish.id)
    }
  }

  visit(0, new Set(), [])
  return best
}

function buildRecommendation({ dishes, restrictedIngredientIds = [], month, peopleCount, maxCookMinutes, mode = 'balanced', familyPreferenceScores, hasFamilyPreferences = Boolean(familyPreferenceScores) }) {
  const weights = MODE_WEIGHTS[mode] || MODE_WEIGHTS.balanced
  const candidates = dishes
    .filter((dish) => !dishMatchesRestriction(dish, restrictedIngredientIds))
    .map((dish) => ({ ...dish, score: scoreDish(dish, month, maxCookMinutes, weights, familyPreferenceScores && familyPreferenceScores[dish.category], hasFamilyPreferences) }))
    .sort((left, right) => right.score.total - left.score.total || left.cookMinutes - right.cookMinutes)

  const requirements = categoryRequirements(peopleCount)
  const menu = findBestMenu(candidates, requirements, Number(maxCookMinutes))
  if (!menu) {
    const missingCategory = requirements.find((category) => !candidates.some((dish) => dish.category === category))
    return { ok: false, message: '菜谱库缺少可用的' + (missingCategory || '指定分类') + '，请补充菜谱或调整忌口', items: [] }
  }

  const items = menu.items
  items.sort((left, right) => right.score.total - left.score.total || left.cookMinutes - right.cookMinutes)

  const totalMinutes = menu.totalCookMinutes
  const overageMinutes = Math.max(0, totalMinutes - Number(maxCookMinutes))
  const withinTimeLimit = overageMinutes === 0
  const timeWarning = withinTimeLimit
    ? ''
    : '预计需要 ' + totalMinutes + ' 分钟才能完成，超出你设置的 ' + maxCookMinutes + ' 分钟，需要多预留 ' + overageMinutes + ' 分钟。'
  return {
    ok: true,
    items,
    totalCookMinutes: totalMinutes,
    totalScore: menu.totalScore,
    withinTimeLimit,
    timeOverageMinutes: overageMinutes,
    timeWarning,
    reason: timeWarning || '已优先选择符合设定时间的菜单。',
    scoreBreakdown: {
      season: averageScore(items, 'season'),
      preference: averageScore(items, 'preference'),
      nutrition: averageScore(items, 'nutrition'),
      time: averageScore(items, 'time')
    }
  }
}

module.exports = { MODE_WEIGHTS, PREFERENCE_BASE_SCORE, PREFERENCE_WEIGHT, aggregateFamilyPreferences, buildRecommendation }
