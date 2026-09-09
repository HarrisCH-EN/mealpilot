const { HttpError, isPositiveInteger } = require('../http')

function normalizeTagIds(value) {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new HttpError(400, '标签参数不合法')
  const ids = []
  const seen = new Set()
  for (const item of value) {
    if (!isPositiveInteger(item)) throw new HttpError(400, '标签参数不合法')
    const id = Number(item)
    if (!seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}

async function readRecipeTagIds(connection, recipeId) {
  const [rows] = await connection.execute('SELECT tag_id AS tagId FROM recipe_tags WHERE recipe_id = ?', [recipeId])
  return rows.map((row) => Number(row.tagId))
}

async function validateRecipeTagIds(connection, familyId, tagIds, existingTagIds = []) {
  if (!tagIds.length) return
  const placeholders = tagIds.map(() => '?').join(', ')
  const [rows] = await connection.execute(
    `SELECT id, family_id AS familyId, kind FROM tag_definitions WHERE id IN (${placeholders}) AND status = 'active'`,
    tagIds
  )
  if (rows.length !== tagIds.length) throw new HttpError(404, '标签不存在')
  for (const tag of rows) {
    if (tag.kind === 'custom' && Number(tag.familyId) !== Number(familyId)) throw new HttpError(404, '标签不存在')
  }
}

async function validatePreferenceTagIds(connection, familyId, preferences = {}) {
  if (preferences === null || typeof preferences !== 'object' || Array.isArray(preferences)) {
    throw new HttpError(400, 'preferences 必须是对象')
  }
  const allowedKeys = new Set(['selectedTagIds'])
  if (Object.keys(preferences).some((key) => !allowedKeys.has(key))) throw new HttpError(400, '存在不受支持的推荐偏好字段')
  const selectedTagIds = normalizeTagIds(preferences.selectedTagIds) || []
  if (!selectedTagIds.length) return { selectedTagIds: [] }
  const placeholders = selectedTagIds.map(() => '?').join(', ')
  const [rows] = await connection.execute(
    `SELECT id, family_id AS familyId, kind
     FROM tag_definitions
     WHERE id IN (${placeholders}) AND status = 'active'`,
    selectedTagIds
  )
  if (rows.length !== selectedTagIds.length) throw new HttpError(404, '推荐偏好标签不存在')
  for (const tag of rows) {
    if (tag.kind === 'custom' && Number(tag.familyId) !== Number(familyId)) throw new HttpError(404, '推荐偏好标签不存在')
  }
  return { selectedTagIds }
}

async function replaceRecipeTags(connection, recipeId, tagIds) {
  await connection.execute('DELETE FROM recipe_tags WHERE recipe_id = ?', [recipeId])
  for (const tagId of tagIds) {
    await connection.execute('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)', [recipeId, tagId])
  }
}

function formatTag(row) {
  return {
    id: Number(row.tagId),
    code: row.code || null,
    name: row.name,
    kind: row.kind,
  }
}

async function loadRecipeTags(database, recipeIds, familyId) {
  if (!recipeIds.length) return []
  const placeholders = recipeIds.map(() => '?').join(', ')
  const [rows] = await database.execute(
    `SELECT rt.recipe_id AS recipeId, td.id AS tagId, td.code, td.name, td.kind
     FROM recipe_tags rt
     JOIN tag_definitions td ON td.id = rt.tag_id
     WHERE rt.recipe_id IN (${placeholders})
       AND (td.family_id IS NULL OR td.family_id = ?)
       AND td.status = 'active'
     ORDER BY rt.recipe_id, td.kind, td.id`,
    [...recipeIds, familyId]
  )
  return rows.map((row) => ({ recipeId: Number(row.recipeId), tag: formatTag(row) }))
}

function attachRecipeTags(rows, tagRows) {
  const grouped = new Map()
  for (const row of tagRows) {
    if (!grouped.has(row.recipeId)) grouped.set(row.recipeId, [])
    grouped.get(row.recipeId).push(row.tag)
  }
  return rows.map((row) => ({ ...row, tags: grouped.get(Number(row.id)) || [] }))
}

module.exports = { normalizeTagIds, readRecipeTagIds, validateRecipeTagIds, validatePreferenceTagIds, replaceRecipeTags, loadRecipeTags, attachRecipeTags }
