const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..', '..')

test('schema supports archived families and nullable historical member identities', () => {
  const schema = fs.readFileSync(path.join(root, 'database', '01_schema.sql'), 'utf8')
  const migration = fs.readFileSync(path.join(root, 'database', '11_account_family_lifecycle.sql'), 'utf8')

  for (const sql of [schema, migration]) {
    assert.match(sql, /status\s+ENUM\('active',\s*'archived'\)/i)
    assert.match(sql, /disbanded_at\s+DATETIME\s+NULL/i)
    assert.match(sql, /purge_after\s+DATETIME\s+NULL/i)
    assert.match(sql, /owner_user_id\s+BIGINT\s+UNSIGNED\s+NULL/i)
    assert.match(sql, /FOREIGN KEY \(owner_user_id\).*ON DELETE SET NULL/is)
    assert.match(sql, /user_id\s+BIGINT\s+UNSIGNED\s+NULL/i)
    assert.match(sql, /FOREIGN KEY \(user_id\).*ON DELETE SET NULL/is)
  }
  assert.doesNotMatch(migration, /DROP FOREIGN KEY fk_family_owner,/i)
  assert.doesNotMatch(migration, /DROP FOREIGN KEY fk_member_user,/i)
})

test('server exposes account deletion plus archive, recovery, restore and purge services', () => {
  const authRoutes = fs.readFileSync(path.join(root, 'server', 'src', 'routes', 'auth.js'), 'utf8')
  const familyRoutes = fs.readFileSync(path.join(root, 'server', 'src', 'routes', 'families.js'), 'utf8')
  const server = fs.readFileSync(path.join(root, 'server', 'src', 'server.js'), 'utf8')

  assert.match(authRoutes, /delete\(['"]\/auth\/account['"]/i)
  assert.match(familyRoutes, /delete\(['"]\/families\/current['"]/i)
  assert.match(familyRoutes, /get\(['"]\/families\/recoverable['"]/i)
  assert.match(familyRoutes, /post\(['"]\/families\/:familyId\/restore['"]/i)
  assert.match(server, /purgeExpiredFamilies/)
  assert.match(server, /60\s*\*\s*60\s*\*\s*1000/)
})
