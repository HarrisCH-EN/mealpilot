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
  assert.match(sql, /role ENUM\('owner', 'admin', 'member'\) NOT NULL DEFAULT 'member'/)
  assert.match(sql, /invite_code CHAR\(6\) CHARACTER SET ascii COLLATE ascii_bin NOT NULL/)

  const migration = fs.readFileSync(path.join(__dirname, '../../database/09_family-admin-role.sql'), 'utf8')
  assert.match(migration, /MODIFY COLUMN role ENUM\('owner', 'admin', 'member'\) NOT NULL DEFAULT 'member'/)

  const inviteMigration = fs.readFileSync(path.join(__dirname, '../../database/10_family-invite-code.sql'), 'utf8')
  assert.match(inviteMigration, /CHAR\(6\).*CHARACTER SET ascii COLLATE ascii_bin/i)
})

test('database migration entry point applies ordered history without forcing the mealpilot database', () => {
  const migrationRunnerPath = path.join(__dirname, '../src/scripts/migration-runner.js')
  assert.equal(fs.existsSync(migrationRunnerPath), true, 'migration runner must exist')
  const runner = fs.readFileSync(migrationRunnerPath, 'utf8')
  for (const migration of [
    '04_recommendation_refactor_r1.sql',
    '05_recommendation_run_nullable_legacy.sql',
    '06_recipe_tag_metadata_backfill.sql',
    '07_remove_cuisine_tags.sql',
    '08_tag_system_v1.sql',
    '09_family-admin-role.sql',
    '10_family-invite-code.sql',
    '11_account_family_lifecycle.sql'
  ]) assert.match(runner, new RegExp(migration.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(runner, /schema_migrations/)
  assert.match(runner, /GET_LOCK/)
  assert.match(runner, /normalizeMigrationSql/)
  const { normalizeMigrationSql, MIGRATION_FILES } = require('../src/scripts/migration-runner')
  assert.deepEqual(MIGRATION_FILES, [
    '04_recommendation_refactor_r1.sql',
    '05_recommendation_run_nullable_legacy.sql',
    '06_recipe_tag_metadata_backfill.sql',
    '07_remove_cuisine_tags.sql',
    '08_tag_system_v1.sql',
    '09_family-admin-role.sql',
    '10_family-invite-code.sql',
    '11_account_family_lifecycle.sql'
  ])
  assert.equal(normalizeMigrationSql('USE mealpilot;\nSELECT 1;'), 'SELECT 1;')
  assert.match(runner, /tag_type|recipe_tags.*tag_id/s)
})
