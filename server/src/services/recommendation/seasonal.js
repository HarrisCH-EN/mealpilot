function calculateSeasonalFit(recipe, targetMonth) {
  const items = (recipe.ingredients || []).filter((item) => Array.isArray(item.seasonalMonths) && item.seasonalMonths.length > 0)
  if (items.length === 0) {
    return { score: 50, matchedCount: 0, metadataCount: 0, neutral: true }
  }
  const matchedCount = items.filter((item) => item.seasonalMonths.includes(Number(targetMonth))).length
  return {
    score: Math.round((matchedCount / items.length) * 100),
    matchedCount,
    metadataCount: items.length,
    neutral: false
  }
}

function averageSeasonalFit(recipes, targetMonth) {
  if (!recipes.length) return 50
  return Math.round(recipes.reduce((sum, recipe) => sum + calculateSeasonalFit(recipe, targetMonth).score, 0) / recipes.length)
}

module.exports = { averageSeasonalFit, calculateSeasonalFit }
