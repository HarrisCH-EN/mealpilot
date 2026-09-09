function estimateMenuPrepTime(recipes) {
  const cookMinutes = (recipes || []).map((recipe) => Math.max(0, Number(recipe.cookMinutes) || 0))
  const sumCookMinutes = cookMinutes.reduce((sum, value) => sum + value, 0)
  const longestCookMinutes = cookMinutes.length ? Math.max(...cookMinutes) : 0
  return {
    sumCookMinutes,
    longestCookMinutes,
    estimatedPrepMinutes: longestCookMinutes + Math.ceil((sumCookMinutes - longestCookMinutes) * 0.5)
  }
}

function getTimeMetadata(recipes, maxPrepMinutes) {
  const estimate = estimateMenuPrepTime(recipes)
  const timeOverageMinutes = Math.max(0, estimate.estimatedPrepMinutes - maxPrepMinutes)
  const withinTimeLimit = timeOverageMinutes === 0
  return {
    ...estimate,
    withinTimeLimit,
    timeOverageMinutes,
    timeWarning: withinTimeLimit ? '' : `预计需要约 ${estimate.estimatedPrepMinutes} 分钟，比你设定的 ${maxPrepMinutes} 分钟多约 ${timeOverageMinutes} 分钟。`
  }
}

module.exports = { estimateMenuPrepTime, getTimeMetadata }
