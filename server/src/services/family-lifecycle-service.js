const { isCloudFileId } = require('./cloud-storage-service')

const CLEANUP_LOCK = 'mealpilot_family_lifecycle_cleanup'

function scopedFamilyFile(fileId, prefix, familyId) {
  const normalizedPrefix = String(prefix || '').replace(/\/+$/, '')
  const expected = `${normalizedPrefix}/families/${familyId}/recipes/`
  return Boolean(normalizedPrefix && isCloudFileId(fileId) && fileId.startsWith(expected) && !fileId.slice(expected.length).includes('/'))
}

async function enqueueFamilyFiles(connection, familyId, storageFileIdPrefix) {
  const [rows] = await connection.execute('SELECT cover_url AS fileId FROM recipes WHERE family_id = ?', [familyId])
  for (const row of rows) {
    const fileId = String(row.fileId || '').trim()
    if (!scopedFamilyFile(fileId, storageFileIdPrefix, familyId)) continue
    await connection.execute("INSERT IGNORE INTO storage_cleanup_jobs (file_id, kind) VALUES (?, 'family_recipe')", [fileId])
  }
}

async function deleteArchivedFamily(connection, familyId, now, storageFileIdPrefix) {
  await enqueueFamilyFiles(connection, familyId, storageFileIdPrefix)
  await connection.execute('DELETE FROM menus WHERE family_id = ?', [familyId])
  await connection.execute('DELETE FROM recommendation_runs WHERE family_id = ?', [familyId])
  await connection.execute('DELETE rt FROM recipe_tags rt JOIN recipes r ON r.id = rt.recipe_id WHERE r.family_id = ?', [familyId])
  await connection.execute('DELETE rtl FROM recipe_tags_legacy rtl JOIN recipes r ON r.id = rtl.recipe_id WHERE r.family_id = ?', [familyId])
  await connection.execute('DELETE FROM tag_definitions WHERE family_id = ?', [familyId])
  await connection.execute('DELETE FROM recipes WHERE family_id = ?', [familyId])
  const [deleted] = await connection.execute("DELETE FROM families WHERE id = ? AND status = 'archived' AND purge_after <= ?", [familyId, now])
  return Number(deleted.affectedRows || 0)
}

async function processStorageCleanupJobs(database, cloudStorageService, limit = 50) {
  if (!cloudStorageService || typeof cloudStorageService.deleteFile !== 'function') return { deleted: 0, failed: 0 }
  const [jobs] = await database.execute('SELECT id, file_id AS fileId, attempts FROM storage_cleanup_jobs WHERE next_attempt_at <= CURRENT_TIMESTAMP ORDER BY id LIMIT ?', [limit])
  let deleted = 0
  let failed = 0
  for (const job of jobs) {
    try {
      await cloudStorageService.deleteFile(job.fileId)
      await database.execute('DELETE FROM storage_cleanup_jobs WHERE id = ?', [job.id])
      deleted += 1
    } catch (error) {
      if (error && error.code === 'CLOUDBASE_STORAGE_NOT_FOUND_FAILED') {
        await database.execute('DELETE FROM storage_cleanup_jobs WHERE id = ?', [job.id])
        deleted += 1
        continue
      }
      await database.execute('UPDATE storage_cleanup_jobs SET attempts = attempts + 1, next_attempt_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL LEAST(24, POW(2, LEAST(attempts, 4))) HOUR) WHERE id = ?', [job.id])
      failed += 1
    }
  }
  return { deleted, failed }
}

async function purgeExpiredFamilies({ database, cloudStorageService, storageFileIdPrefix = '', now = new Date() }) {
  const lockConnection = await database.getConnection()
  let acquired = false
  let purged = 0
  try {
    const [lockRows] = await lockConnection.execute('SELECT GET_LOCK(?, 0) AS acquired', [CLEANUP_LOCK])
    acquired = Number(lockRows[0] && lockRows[0].acquired) === 1
    if (!acquired) return { purged: 0, skipped: true }
    const [families] = await lockConnection.execute("SELECT id FROM families WHERE status = 'archived' AND purge_after <= ? ORDER BY purge_after LIMIT 50", [now])
    for (const family of families) {
      await lockConnection.beginTransaction()
      try {
        purged += await deleteArchivedFamily(lockConnection, family.id, now, storageFileIdPrefix)
        await lockConnection.commit()
      } catch (error) {
        await lockConnection.rollback()
        throw error
      }
    }
  } finally {
    if (acquired) await lockConnection.execute('SELECT RELEASE_LOCK(?)', [CLEANUP_LOCK])
    lockConnection.release()
  }
  const storage = await processStorageCleanupJobs(database, cloudStorageService)
  return { purged, skipped: false, storage }
}

module.exports = { purgeExpiredFamilies, processStorageCleanupJobs, deleteArchivedFamily, scopedFamilyFile, CLEANUP_LOCK }
