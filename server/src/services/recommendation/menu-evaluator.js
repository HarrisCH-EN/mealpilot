const { MENU_SCORE_WEIGHTS } = require('./constants')
const { calculateRecipeNutrition } = require('./nutrition')
const { averageSeasonalFit, calculateSeasonalFit } = require('./seasonal')
const { getTimeMetadata } = require('./prep-time-estimator')
const { isCanonicalPreferences, scoreFamilyCategoryPreference, scoreMenuPreferenceMatch, scoreRecipePreferenceMatch } = require('./preference-matcher')
const { calculateRecentNoveltyScore } = require('./recent-history')

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value))
}

function canonicalTagNamesForRecipe(recipe, tagIds) {
  const details = Array.isArray(recipe.tagDetails) ? recipe.tagDetails : []
  const names = new Map(details.map((detail) => [Number(detail.id ?? detail.tagId), detail.name]).filter(([id, name]) => Number.isInteger(id) && name))
  return tagIds.map((id) => names.get(Number(id))).filter(Boolean)
}

function findCommonIngredientIds(recipes, threshold = 0.5) {
  const counts = new Map()
  for (const recipe of recipes) {
    const ids = new Set((recipe.ingredients || []).map((item) => item.ingredientId))
    for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1)
  }
  return new Set([...counts.entries()].filter(([, count]) => count / Math.max(1, recipes.length) >= threshold).map(([id]) => id))
}

function ingredientDiversityScore(recipes, commonIngredientIds = findCommonIngredientIds(recipes)) {
  if (recipes.length < 2) return 50
  const sets = recipes.map((recipe) => new Set((recipe.ingredients || []).map((item) => item.ingredientId).filter((id) => !commonIngredientIds.has(id))))
  const pairScores = []
  for (let left = 0; left < sets.length; left += 1) {
    for (let right = left + 1; right < sets.length; right += 1) {
      const union = new Set([...sets[left], ...sets[right]])
      if (union.size === 0) continue
      const intersection = [...sets[left]].filter((id) => sets[right].has(id)).length
      pairScores.push((1 - intersection / union.size) * 100)
    }
  }
  return pairScores.length ? Math.round(pairScores.reduce((sum, value) => sum + value, 0) / pairScores.length) : 50
}

function methodDiversityScore(recipes) {
  const methods = recipes.map((recipe) => recipe.tags && recipe.tags.method).filter((values) => Array.isArray(values) && values.length > 0).map((values) => values[0])
  if (!methods.length) return 50
  return Math.round((new Set(methods).size / methods.length) * 100)
}

function macroBandScore(ratio, min, max) {
  if (ratio >= min && ratio <= max) return 100
  if (ratio < min) return clamp(100 - ((min - ratio) / min) * 100)
  return clamp(100 - ((ratio - max) / (1 - max)) * 100)
}

function nutritionBalanceScore(recipes) {
  const nutrition = recipes.map(calculateRecipeNutrition).reduce((totals, value) => ({
    calories: totals.calories + value.calories,
    proteinGrams: totals.proteinGrams + value.proteinGrams,
    fatGrams: totals.fatGrams + value.fatGrams,
    carbohydrateGrams: totals.carbohydrateGrams + value.carbohydrateGrams
  }), { calories: 0, proteinGrams: 0, fatGrams: 0, carbohydrateGrams: 0 })
  const macroCalories = nutrition.proteinGrams * 4 + nutrition.fatGrams * 9 + nutrition.carbohydrateGrams * 4
  if (macroCalories <= 0) return { score: 50, nutrition }
  const proteinRatio = nutrition.proteinGrams * 4 / macroCalories
  const fatRatio = nutrition.fatGrams * 9 / macroCalories
  const carbohydrateRatio = nutrition.carbohydrateGrams * 4 / macroCalories
  const score = Math.round((macroBandScore(proteinRatio, 0.1, 0.35) + macroBandScore(fatRatio, 0.15, 0.45) + macroBandScore(carbohydrateRatio, 0.25, 0.65)) / 3)
  return { score, nutrition }
}

function weightedScore(parts) {
  return Math.round((parts.preference * MENU_SCORE_WEIGHTS.preference +
    parts.ingredientDiversity * MENU_SCORE_WEIGHTS.ingredientDiversity +
    parts.methodDiversity * MENU_SCORE_WEIGHTS.methodDiversity +
    parts.nutrition * MENU_SCORE_WEIGHTS.nutrition +
    parts.seasonal * MENU_SCORE_WEIGHTS.seasonal +
    parts.novelty * MENU_SCORE_WEIGHTS.novelty) / 100)
}

function evaluateMenuCandidate(recipes, context) {
  const preferences = context.preferences || {}
  const canonicalPreferences = isCanonicalPreferences(preferences)
  const sessionPreference = scoreMenuPreferenceMatch(recipes, preferences)
  const familyPreference = scoreFamilyCategoryPreference(recipes, context.familyCategoryPreferenceScores || {})
  const nutrition = nutritionBalanceScore(recipes)
  const seasonal = !canonicalPreferences && preferences.seasonal ? averageSeasonalFit(recipes, context.targetMonth) : 50
  const parts = {
    preference: Math.round(sessionPreference.score * 0.8 + familyPreference.score * 0.2),
    ingredientDiversity: ingredientDiversityScore(recipes, context.commonIngredientIds),
    methodDiversity: methodDiversityScore(recipes),
    nutrition: nutrition.score,
    seasonal,
    novelty: calculateRecentNoveltyScore(recipes, context.recentUsage || {})
  }
  const time = getTimeMetadata(recipes, context.maxPrepMinutes)
  const reasonParts = ['满足指定菜单结构']
  if (canonicalPreferences) {
    if (sessionPreference.matchedTagNames.length) reasonParts.push(`匹配偏好标签：${sessionPreference.matchedTagNames.slice(0, 3).join('、')}`)
  } else if (parts.preference > 50) reasonParts.push('符合家庭与本次口味偏好')
  if (parts.seasonal > 50) reasonParts.push('季节匹配较好')
  if (parts.novelty === 100) reasonParts.push('近期菜谱重复较少')
  if (time.withinTimeLimit) reasonParts.push(`预计准备约 ${time.estimatedPrepMinutes} 分钟`)
  else reasonParts.push(time.timeWarning)
  const recipeScores = recipes.map((recipe) => {
    const recipePreference = scoreRecipePreferenceMatch(recipe, preferences)
    const recipeSeasonal = !canonicalPreferences && preferences.seasonal ? calculateSeasonalFit(recipe, context.targetMonth) : { score: 50 }
    const recipeNutrition = calculateRecipeNutrition(recipe)
    return {
      recipe,
      dishScore: Math.round(recipePreference.score * 0.5 + recipeSeasonal.score * 0.2 + (recipeNutrition.highProtein ? 80 : 50) * 0.3),
      reason: [
        canonicalPreferences && recipePreference.matchedTagIds.length ? `匹配偏好标签：${canonicalTagNamesForRecipe(recipe, recipePreference.matchedTagIds).slice(0, 3).join('、')}` : '',
        !canonicalPreferences && recipePreference.score > 50 ? '匹配本次偏好' : '',
        !canonicalPreferences && preferences.seasonal && recipeSeasonal.score > 50 ? '季节匹配较好' : '',
        recipeNutrition.highProtein ? '蛋白质含量较高' : ''
      ].filter(Boolean).join('；') || '纳入指定结构候选'
    }
  })
  return {
    recipes,
    recipeIds: recipes.map((recipe) => recipe.id),
    recipeScores,
    totalScore: weightedScore(parts),
    scoreBreakdown: {
      ...parts,
      tagPreference: {
        score: sessionPreference.tagPreferenceScore || 0,
        selectedTagIds: sessionPreference.selectedTagIds || [],
        matchedTagIds: sessionPreference.matchedTagIds || []
      }
    },
    reasonParts,
    ...time,
    nutrition: nutrition.nutrition,
    preferenceDiagnostics: { sessionPreference, familyPreference }
  }
}

module.exports = {
  evaluateMenuCandidate,
  findCommonIngredientIds,
  ingredientDiversityScore,
  methodDiversityScore,
  nutritionBalanceScore,
  weightedScore
}
