const mysql = require('../server/node_modules/mysql2/promise')
const { getConfig } = require('../server/src/config')

const TABLES = [
  'users',
  'families',
  'family_members',
  'ingredients',
  'ingredient_seasons',
  'recipes',
  'recipe_ingredients',
  'tag_definitions',
  'recipe_tags_legacy',
  'recipe_tags',
  'member_category_preferences',
  'member_ingredient_restrictions',
  'recommendation_runs',
  'recommendation_items',
  'recommendation_candidates',
  'recommendation_candidate_items',
  'menus',
  'menu_items',
  'menu_feedback'
]

const CHECKS = {
  orphanFamilyMembers: `
    SELECT COUNT(*) AS count
    FROM family_members fm
    LEFT JOIN families f ON f.id = fm.family_id
    LEFT JOIN users u ON u.id = fm.user_id
    WHERE f.id IS NULL OR u.id IS NULL
  `,
  orphanRecipeIngredients: `
    SELECT COUNT(*) AS count
    FROM recipe_ingredients ri
    LEFT JOIN recipes r ON r.id = ri.recipe_id
    LEFT JOIN ingredients i ON i.id = ri.ingredient_id
    WHERE r.id IS NULL OR i.id IS NULL
  `,
  orphanMenuItems: `
    SELECT COUNT(*) AS count
    FROM menu_items mi
    LEFT JOIN menus m ON m.id = mi.menu_id
    LEFT JOIN recipes r ON r.id = mi.recipe_id
    WHERE m.id IS NULL OR r.id IS NULL
  `,
  orphanFeedback: `
    SELECT COUNT(*) AS count
    FROM menu_feedback mf
    LEFT JOIN menu_items mi ON mi.id = mf.menu_item_id
    LEFT JOIN family_members fm ON fm.id = mf.member_id
    WHERE mi.id IS NULL OR fm.id IS NULL
  `,
  recipeAuthorFamilyMismatch: `
    SELECT COUNT(*) AS count
    FROM recipes r
    LEFT JOIN family_members fm ON fm.id = r.created_by_member_id
    WHERE fm.id IS NULL OR fm.family_id <> r.family_id
  `,
  menuCreatorFamilyMismatch: `
    SELECT COUNT(*) AS count
    FROM menus m
    LEFT JOIN family_members fm ON fm.id = m.created_by_member_id
    WHERE fm.id IS NULL OR fm.family_id <> m.family_id
  `,
  menuRecipeFamilyMismatch: `
    SELECT COUNT(*) AS count
    FROM menu_items mi
    JOIN menus m ON m.id = mi.menu_id
    JOIN recipes r ON r.id = mi.recipe_id
    WHERE m.family_id <> r.family_id
  `,
  recommendationRecipeFamilyMismatch: `
    SELECT COUNT(*) AS count
    FROM recommendation_items ri
    JOIN recommendation_runs rr ON rr.id = ri.recommendation_run_id
    JOIN recipes r ON r.id = ri.recipe_id
    WHERE rr.family_id <> r.family_id
  `,
  candidateRecipeFamilyMismatch: `
    SELECT COUNT(*) AS count
    FROM recommendation_candidate_items ci
    JOIN recommendation_candidates c ON c.id = ci.recommendation_candidate_id
    JOIN recommendation_runs rr ON rr.id = c.recommendation_run_id
    JOIN recipes r ON r.id = ci.recipe_id
    WHERE rr.family_id <> r.family_id
  `,
  feedbackFamilyMismatch: `
    SELECT COUNT(*) AS count
    FROM menu_feedback mf
    JOIN menu_items mi ON mi.id = mf.menu_item_id
    JOIN menus m ON m.id = mi.menu_id
    JOIN family_members fm ON fm.id = mf.member_id
    WHERE m.family_id <> fm.family_id
  `,
  activeFamilyCountPerUser: `
    SELECT COUNT(*) AS count
    FROM (
      SELECT user_id
      FROM family_members
      WHERE status = 'active'
      GROUP BY user_id
      HAVING COUNT(*) > 1
    ) conflicts
  `,
  emptyFamilyNames: `
    SELECT COUNT(*) AS count
    FROM families
    WHERE TRIM(name) = ''
  `
}

async function main() {
  const config = getConfig()
  const connection = await mysql.createConnection(config.mysql)
  try {
    const [tableRows] = await connection.execute(
      `SELECT TABLE_NAME
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
       ORDER BY TABLE_NAME`
    )
    const availableTables = new Set(tableRows.map((row) => row.TABLE_NAME))
    const counts = {}
    for (const table of TABLES) {
      if (!availableTables.has(table)) {
        counts[table] = null
        continue
      }
      const [rows] = await connection.execute(`SELECT COUNT(*) AS count FROM \`${table}\``)
      counts[table] = Number(rows[0].count)
    }

    const integrity = {}
    for (const [name, sql] of Object.entries(CHECKS)) {
      const [rows] = await connection.execute(sql)
      integrity[name] = Number(rows[0].count)
    }

    const [userAvatarRows] = await connection.execute("SELECT avatar_url AS url FROM users WHERE avatar_url <> ''")
    const [recipeCoverRows] = await connection.execute("SELECT cover_url AS url FROM recipes WHERE cover_url <> ''")
    const referencedStorageIds = new Set(
      [...userAvatarRows, ...recipeCoverRows]
        .map((row) => String(row.url || ''))
        .filter((url) => url.startsWith('cloud://'))
    )
    const legacyStorageReferences = [...userAvatarRows, ...recipeCoverRows]
      .map((row) => String(row.url || ''))
      .filter((url) => url && !url.startsWith('cloud://'))

    const [schemaRows] = await connection.execute(
      `SELECT TABLE_NAME, ENGINE, TABLE_COLLATION
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
       ORDER BY TABLE_NAME`
    )

    console.log(JSON.stringify({
      database: config.mysql.database,
      tables: schemaRows,
      counts,
      integrity,
      storage: {
        stableReferences: referencedStorageIds.size,
        legacyReferences: legacyStorageReferences.length,
        legacyPaths: legacyStorageReferences.sort()
      },
      readOnly: true
    }, null, 2))
  } finally {
    await connection.end()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = { main }
