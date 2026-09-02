const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('schema defines the required relational tables and menu uniqueness constraint', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../database/01_schema.sql'), 'utf8')

  for (const table of ['users', 'families', 'family_members', 'recipes', 'ingredients', 'recipe_ingredients', 'menus', 'menu_items']) {
    assert.match(sql, new RegExp(`CREATE TABLE ${table}`))
  }
  assert.match(sql, /UNIQUE KEY uq_menu_slot \(family_id, menu_date, meal_type\)/)
  assert.match(sql, /FOREIGN KEY \(recipe_id\) REFERENCES recipes\(id\)/)
})
