const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..', '..')

test('single-admin schema replaces owner identity with admin identity', () => {
  const schema = fs.readFileSync(path.join(root, 'database', '01_schema.sql'), 'utf8')
  const migration = fs.readFileSync(path.join(root, 'database', '12_single_admin_role.sql'), 'utf8')

  assert.match(schema, /admin_user_id\s+BIGINT\s+UNSIGNED/i)
  assert.match(schema, /role\s+ENUM\('admin', 'member'\)/i)
  assert.doesNotMatch(schema, /owner_user_id|ENUM\('owner'/i)
  assert.match(migration, /owner_user_id/i)
  assert.match(migration, /admin_user_id/i)
  assert.match(migration, /UPDATE\s+family_members\s+SET\s+role\s*=\s*'admin'/i)
})

test('family routes expose transfer-admin and no creator transfer endpoint', () => {
  const routes = fs.readFileSync(path.join(root, 'server', 'src', 'routes', 'families.js'), 'utf8')
  assert.match(routes, /families\/current\/transfer-admin/)
  assert.doesNotMatch(routes, /transfer-ownership|owner_user_id|role === 'owner'/)
})

test('account deletion distinguishes the sole administrator auto-disband path', () => {
  const authService = fs.readFileSync(path.join(root, 'server', 'src', 'services', 'auth-service.js'), 'utf8')
  assert.match(authService, /admin_user_id/)
  assert.match(authService, /status\s*=\s*'archived'/)
  assert.match(authService, /ACCOUNT_ADMIN_BLOCKED/)
})
