const { HttpError } = require('../http')

async function assertActiveMember(connection, familyId, memberId) {
  const [members] = await connection.execute(
    `SELECT id FROM family_members WHERE id = ? AND family_id = ? AND status = 'active'`,
    [memberId, familyId]
  )
  if (!members[0]) throw new HttpError(404, '家庭成员不存在')
}

async function assertActiveRecipe(connection, familyId, recipeId) {
  const [recipes] = await connection.execute(
    `SELECT id FROM recipes WHERE id = ? AND family_id = ? AND status = 'active'`,
    [recipeId, familyId]
  )
  if (!recipes[0]) throw new HttpError(404, '菜谱不存在')
}

function isDuplicateKeyError(error) {
  return error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062
}

async function getExistingMenu(connection, familyId, menuDate, mealType) {
  const [menus] = await connection.execute(
    'SELECT id FROM menus WHERE family_id = ? AND menu_date = ? AND meal_type = ?',
    [familyId, menuDate, mealType]
  )
  return menus[0] || null
}

async function getOrCreateMenu(connection, familyId, memberId, menuDate, mealType) {
  try {
    return (await connection.execute(
      `INSERT INTO menus (family_id, created_by_member_id, menu_date, meal_type)
       VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [familyId, memberId, menuDate, mealType]
    ))[0]
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error
    const existing = await getExistingMenu(connection, familyId, menuDate, mealType)
    if (!existing) throw error
    return { insertId: existing.id }
  }
}

async function getExistingMenuItem(connection, menuId, recipeId) {
  const [items] = await connection.execute(
    'SELECT id, note FROM menu_items WHERE menu_id = ? AND recipe_id = ? FOR UPDATE',
    [menuId, recipeId]
  )
  return items[0] || null
}

async function addMenuItemRecord({ connection, menuId, recipeId, note = '', source = 'manual' }) {
  const existing = await getExistingMenuItem(connection, menuId, recipeId)
  if (existing) return { menuId, itemId: existing.id, status: 'already-present', note: existing.note }

  try {
    const [created] = await connection.execute(
      'INSERT INTO menu_items (menu_id, recipe_id, source, note) VALUES (?, ?, ?, ?)',
      [menuId, recipeId, source, note]
    )
    return { menuId, itemId: created.insertId, status: 'created', note }
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error
    const existingAfterConflict = await getExistingMenuItem(connection, menuId, recipeId)
    if (!existingAfterConflict) throw error
    return { menuId, itemId: existingAfterConflict.id, status: 'already-present', note: existingAfterConflict.note }
  }
}

async function addMenuItem({ connection, familyId, memberId, menuDate, mealType, recipeId, note = '', source = 'manual' }) {
  await assertActiveMember(connection, familyId, memberId)
  await assertActiveRecipe(connection, familyId, recipeId)
  const menu = await getOrCreateMenu(connection, familyId, memberId, menuDate, mealType)
  return addMenuItemRecord({ connection, menuId: menu.insertId, recipeId, note, source })
}

module.exports = { addMenuItem, addMenuItemRecord }
