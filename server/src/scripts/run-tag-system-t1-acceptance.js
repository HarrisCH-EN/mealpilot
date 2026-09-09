const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const mysql = require('mysql2/promise')
const { getConfig } = require('../config')

const config = getConfig()
const testDatabase = String(process.env.MYSQL_TEST_DATABASE || '').trim()
const businessDatabase = String(config.mysql.database || '').trim()
const allowWrites = process.env.PHASE_1C_ALLOW_DB_WRITES === '1'

function assertSafeDatabase(databaseName) {
  if (!databaseName || !/test/i.test(databaseName) || !/^[A-Za-z0-9_]+$/.test(databaseName)) {
    throw new Error('MYSQL_TEST_DATABASE must be a safe database name containing test')
  }
  if (databaseName === businessDatabase) throw new Error('MYSQL_TEST_DATABASE must not equal MYSQL_DATABASE')
}

async function readSql(fileName) {
  return fs.readFile(path.join(__dirname, '../../../database', fileName), 'utf8')
}

function forDatabase(sql, databaseName) {
  const useStatement = `USE \`${databaseName}\`;`
  return sql.replace(/CREATE DATABASE IF NOT EXISTS smart_meal[^;]*;\s*/i, '').replace(/USE smart_meal\s*;/ig, useStatement)
}

async function executeFile(connection, fileName, databaseName) {
  await connection.query(forDatabase(await readSql(fileName), databaseName))
}

async function recreateDatabase(admin, databaseName) {
  await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``)
  await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
}

async function schemaState(connection) {
  const [definitions] = await connection.execute(
    "SELECT code, name FROM tag_definitions WHERE kind = 'system' ORDER BY code"
  )
  const [relations] = await connection.execute(`
    SELECT td.code, COUNT(*) AS relationCount
    FROM recipe_tags rt
    INNER JOIN tag_definitions td ON td.id = rt.tag_id
    GROUP BY td.code
    ORDER BY td.code
  `)
  const [relationPairs] = await connection.execute(`
    SELECT rt.recipe_id AS recipeId, td.code
    FROM recipe_tags rt
    INNER JOIN tag_definitions td ON td.id = rt.tag_id
    ORDER BY rt.recipe_id, td.code
  `)
  const [legacy] = await connection.execute('SELECT COUNT(*) AS count FROM recipe_tags_legacy')
  return {
    definitions: definitions.map((row) => [row.code, row.name]),
    relations: relations.map((row) => [row.code, Number(row.relationCount)]),
    relationPairs: relationPairs.map((row) => [Number(row.recipeId), row.code]),
    legacyCount: Number(legacy[0].count)
  }
}

async function main() {
  assertSafeDatabase(testDatabase)
  if (!allowWrites) throw new Error('PHASE_1C_ALLOW_DB_WRITES=1 is required')

  const admin = await mysql.createConnection({ ...config.mysql, database: undefined, multipleStatements: true })

  try {
    await recreateDatabase(admin, testDatabase)
    const fresh = await mysql.createConnection({ ...config.mysql, database: testDatabase, multipleStatements: true })
    await executeFile(fresh, '01_schema.sql', testDatabase)
    await executeFile(fresh, '02_seed.sql', testDatabase)

    const freshState = await schemaState(fresh)
    assert.deepEqual(freshState.definitions, [
      ['bake', '烤'], ['crab', '蟹'], ['fish', '鱼'], ['fried', '炸'], ['seafood', '海鲜'],
      ['shrimp', '虾'], ['sour', '酸'], ['spicy', '辣'], ['steam', '蒸'], ['sweet', '甜']
    ])
    assert.deepEqual(freshState.relations, [
      ['fish', 3], ['shrimp', 5], ['sour', 5], ['spicy', 1], ['steam', 3], ['sweet', 11]
    ])
    assert.equal(freshState.legacyCount, 0)

    const [columns] = await fresh.execute(
      "SELECT column_name AS columnName FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'recipe_tags' ORDER BY ordinal_position"
    )
    assert.deepEqual(columns.map((row) => row.columnName), ['recipe_id', 'tag_id'])
    const [customColumns] = await fresh.execute(
      "SELECT column_name AS columnName FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tag_definitions'"
    )
    assert.ok(customColumns.some((row) => row.columnName === 'normalized_name'))
    const [[demoFamily]] = await fresh.execute("SELECT id FROM families WHERE invite_code = 'MEAL26'")
    const [[demoMember]] = await fresh.execute('SELECT id FROM family_members WHERE family_id = ?', [demoFamily.id])
    const [custom] = await fresh.execute(
      "INSERT INTO tag_definitions (family_id, kind, code, name, normalized_name, created_by_member_id) VALUES (?, 'custom', NULL, ?, ?, ?)",
      [demoFamily.id, '下饭', '下饭', demoMember.id]
    )
    assert.ok(custom.insertId)
    await assert.rejects(fresh.execute(
      "INSERT INTO tag_definitions (family_id, kind, code, name, normalized_name, created_by_member_id) VALUES (?, 'custom', NULL, ?, ?, ?)",
      [demoFamily.id, '下饭重复', '下饭', demoMember.id]
    ))
    await fresh.execute("UPDATE tag_definitions SET status = 'inactive' WHERE id = ?", [custom.insertId])
    const [[untagged]] = await fresh.execute(`
      SELECT COUNT(*) AS count
      FROM recipes r
      LEFT JOIN recipe_tags rt ON rt.recipe_id = r.id
      WHERE rt.recipe_id IS NULL
    `)
    assert.ok(Number(untagged.count) > 0, 'zero-tag recipes must remain valid')
    await fresh.end()

    await recreateDatabase(admin, testDatabase)
    const upgrade = await mysql.createConnection({ ...config.mysql, database: testDatabase, multipleStatements: true })
    await executeFile(upgrade, '01_schema.sql', testDatabase)
    await executeFile(upgrade, '02_seed.sql', testDatabase)
    await upgrade.query('DROP TABLE recipe_tags')
    await upgrade.query('DROP TABLE recipe_tags_legacy')
    await upgrade.query('DROP TABLE tag_definitions')
    await upgrade.query(`
      CREATE TABLE recipe_tags (
        recipe_id BIGINT UNSIGNED NOT NULL,
        tag_type ENUM('taste', 'dietary', 'method') NOT NULL,
        tag_value VARCHAR(40) NOT NULL,
        PRIMARY KEY (recipe_id, tag_type, tag_value),
        CONSTRAINT fk_legacy_recipe_tag_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `)
    await executeFile(upgrade, '06_recipe_tag_metadata_backfill.sql', testDatabase)
    await executeFile(upgrade, '08_tag_system_v1.sql', testDatabase)
    await executeFile(upgrade, '08_tag_system_v1.sql', testDatabase)

    const upgradedState = await schemaState(upgrade)
    assert.deepEqual(upgradedState.definitions, freshState.definitions)
    assert.deepEqual(upgradedState.relations, freshState.relations)
    assert.deepEqual(upgradedState.relationPairs, freshState.relationPairs)
    assert.equal(upgradedState.legacyCount, 140)
    const [archiveRows] = await upgrade.execute("SELECT COUNT(*) AS count FROM recipe_tags_legacy WHERE tag_value = 'seafood'")
    assert.equal(Number(archiveRows[0].count), 8)
    const [seafoodRows] = await upgrade.execute("SELECT COUNT(*) AS count FROM recipe_tags rt INNER JOIN tag_definitions td ON td.id = rt.tag_id WHERE td.code = 'seafood'")
    assert.equal(Number(seafoodRows[0].count), 0)

    await upgrade.end()
    console.log(`T1 acceptance passed in isolated database: ${testDatabase}`)
  } finally {
    // Leave the isolated database in the fresh, seedable state expected by
    // the regular integration suite.  This cleanup never targets business DB.
    await recreateDatabase(admin, testDatabase)
    const restored = await mysql.createConnection({ ...config.mysql, database: testDatabase, multipleStatements: true })
    await executeFile(restored, '01_schema.sql', testDatabase)
    await executeFile(restored, '02_seed.sql', testDatabase)
    await restored.end()
    await admin.end()
  }
}

main().catch((error) => {
  console.error(`T1 acceptance failed: ${error.message}`)
  process.exitCode = 1
})
