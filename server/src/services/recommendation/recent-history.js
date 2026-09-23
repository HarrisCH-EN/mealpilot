const { NOVELTY_PENALTIES } = require('./constants')

function daysAgoValue(value) {
  if (typeof value === 'object' && value !== null) return Number(value.daysAgo)
  return Number(value)
}

function calculateRecentNoveltyScore(recipes, recentUsage = {}) {
  if (!recipes.length) return 100
  const scores = recipes.map((recipe) => {
    const daysAgo = daysAgoValue(recentUsage[recipe.id])
    if (!Number.isFinite(daysAgo) || daysAgo > 7) return 100
    if (daysAgo <= 3) return 100 - NOVELTY_PENALTIES.recent
    return 100 - NOVELTY_PENALTIES.previousWeek
  })
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
}

async function loadRecentRecipeUsage(connection, { familyId, targetDate }) {
  const [rows] = await connection.execute(`
    SELECT mi.recipe_id AS recipeId, DATEDIFF(?, m.menu_date) AS daysAgo
    FROM menus m
    INNER JOIN menu_items mi ON mi.menu_id = m.id
    WHERE m.family_id = ?
      AND m.menu_date < ?
      AND m.menu_date >= DATE_SUB(?, INTERVAL 7 DAY)
  `, [targetDate, familyId, targetDate, targetDate])
  return Object.fromEntries(rows.map((row) => [Number(row.recipeId), Number(row.daysAgo)]))
}

async function loadLowRatedRecipeIds(connection, { familyId, memberId }) {
  const [rows] = await connection.execute(`
    SELECT DISTINCT mi.recipe_id AS recipeId
    FROM menus m
    INNER JOIN menu_items mi ON mi.menu_id = m.id
    INNER JOIN menu_feedback f ON f.menu_item_id = mi.id
    WHERE f.member_id = ? AND m.family_id = ? AND f.rating <= 2
  `, [memberId, familyId])
  return rows.map((row) => Number(row.recipeId))
}

module.exports = { calculateRecentNoveltyScore, loadRecentRecipeUsage, loadLowRatedRecipeIds }
