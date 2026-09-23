const { HttpError } = require('../http')
const { WechatAuthError } = require('./wechat-auth-service')
const { presentUser, presentSession } = require('./auth-session')
const { isCloudFileId } = require('./cloud-storage-service')

const MAX_WECHAT_CODE_LENGTH = 256

async function findOrCreateWechatUser(database, { openid, displayName = '微信用户', avatarUrl = '' }) {
  const [writeResult] = await database.execute(
    `INSERT INTO users (openid, display_name, avatar_url) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [openid, displayName, avatarUrl]
  )
  const [rows] = await database.execute('SELECT id, openid, display_name, avatar_url FROM users WHERE openid = ?', [openid])
  if (!rows[0]) throw new HttpError(500, '登录用户数据异常', 'AUTH_USER_PERSISTENCE_FAILED')
  return { user: rows[0], isNewUser: Number(writeResult && writeResult.affectedRows) === 1 }
}

function mapWechatAuthError(error) {
  if (!(error instanceof WechatAuthError)) return error
  if (error.kind === 'invalid-code') return new HttpError(401, '微信登录凭证无效', 'AUTH_WECHAT_INVALID_CODE')
  if (error.kind === 'unavailable') return new HttpError(503, '微信登录服务暂时不可用', 'AUTH_WECHAT_UNAVAILABLE')
  return new HttpError(500, '微信登录配置不可用', 'AUTH_WECHAT_CONFIG_ERROR')
}

function assertWechatCode(code) {
  if (typeof code !== 'string' || !code.trim()) throw new HttpError(400, '缺少字段：code', 'AUTH_WECHAT_CODE_REQUIRED')
  const normalizedCode = code.trim()
  if (normalizedCode.length > MAX_WECHAT_CODE_LENGTH) throw new HttpError(400, '微信登录凭证过长', 'AUTH_WECHAT_CODE_INVALID')
  return normalizedCode
}

function createAuthService({ database, jwtSecret, wechatAuthService, mediaUrlService, storageFileIdPrefix = '' } = {}) {
  return {
    async loginOrRegister(code) {
      const normalizedCode = assertWechatCode(code)
      let session
      try {
        session = await wechatAuthService.exchangeCodeForSession(normalizedCode)
      } catch (error) {
        if (error instanceof WechatAuthError) {
          const errcode = /^\d+$/.test(String(error.cause || '')) ? Number(error.cause) : undefined
          console.warn('[MealPilot WeChat Auth]', { operation: 'wechat-code2session', kind: error.kind, errcode })
        }
        throw mapWechatAuthError(error)
      }
      if (!session || typeof session.openid !== 'string' || !session.openid.trim()) {
        throw new HttpError(401, '微信登录凭证无效', 'AUTH_WECHAT_INVALID_CODE')
      }
      const { user, isNewUser } = await findOrCreateWechatUser(database, { openid: session.openid.trim() })
      return presentSession({ database, storedUser: user, jwtSecret, mediaUrlService, includeToken: true, isNewUser })
    },

    async loginWithDev({ openid = 'demo-user', displayName = '演示用户' } = {}) {
      const normalizedOpenid = String(openid).trim() || 'demo-user'
      const normalizedName = String(displayName).trim().slice(0, 40) || '演示用户'
      const { user } = await findOrCreateWechatUser(database, { openid: normalizedOpenid, displayName: normalizedName })
      return presentSession({ database, storedUser: user, jwtSecret, mediaUrlService, includeToken: true, isNewUser: false })
    },

    async getSession({ userId, user } = {}) {
      let storedUser = user
      if (!storedUser) {
        const [rows] = await database.execute('SELECT id, openid, display_name, avatar_url FROM users WHERE id = ?', [userId])
        storedUser = rows[0]
      }
      if (!storedUser) throw new HttpError(401, '登录已失效', 'AUTH_SESSION_EXPIRED')
      return presentSession({ database, storedUser, jwtSecret, mediaUrlService })
    },

    async updateProfile({ userId, displayName }) {
      const normalizedName = String(displayName || '').trim()
      if (normalizedName.length > 40) throw new HttpError(400, '用户名不能超过40个字符', 'PROFILE_NAME_INVALID')
      await database.execute('UPDATE users SET display_name = ? WHERE id = ?', [normalizedName, userId])
      const [rows] = await database.execute('SELECT id, openid, display_name, avatar_url FROM users WHERE id = ?', [userId])
      if (!rows[0]) throw new HttpError(401, '登录已失效', 'AUTH_SESSION_EXPIRED')
      return { user: await presentUser(rows[0], mediaUrlService) }
    },

    async deleteAccount({ userId }) {
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const [users] = await connection.execute('SELECT id, avatar_url FROM users WHERE id = ? FOR UPDATE', [userId])
        if (!users[0]) throw new HttpError(401, '登录已失效', 'AUTH_SESSION_EXPIRED')
        const [adminFamilies] = await connection.execute("SELECT id FROM families WHERE admin_user_id = ? AND status = 'active' FOR UPDATE", [userId])
        const [memberships] = await connection.execute(
          `SELECT fm.id AS member_id, fm.family_id, fm.role
             FROM family_members fm JOIN families f ON f.id = fm.family_id
            WHERE fm.user_id = ? AND fm.status = 'active' AND f.status = 'active'
            ORDER BY fm.id FOR UPDATE`,
          [userId]
        )
        if (memberships.length > 1) throw new HttpError(500, '账户家庭关系数据冲突')
        const membership = memberships[0] || null
        if (adminFamilies.length) {
          if (!membership || membership.role !== 'admin' || Number(membership.family_id) !== Number(adminFamilies[0].id)) {
            throw new HttpError(500, '家庭管理员关系数据冲突')
          }
          const [otherMembers] = await connection.execute(
            "SELECT id FROM family_members WHERE family_id = ? AND status = 'active' AND id <> ? FOR UPDATE",
            [membership.family_id, membership.member_id]
          )
          if (otherMembers.length) {
            throw new HttpError(409, '请先转移管理员身份，再注销账号', 'ACCOUNT_ADMIN_BLOCKED')
          }
          const [archived] = await connection.execute(
            "UPDATE families SET status = 'archived', disbanded_at = CURRENT_TIMESTAMP, purge_after = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 DAY) WHERE id = ? AND admin_user_id = ? AND status = 'active'",
            [membership.family_id, userId]
          )
          if (!archived.affectedRows) throw new HttpError(409, '家庭状态已变化，请重试', 'FAMILY_STATE_CHANGED')
          await connection.execute("UPDATE family_members SET status = 'left' WHERE family_id = ? AND status = 'active'", [membership.family_id])
        } else if (membership && membership.role === 'admin') {
          throw new HttpError(500, '家庭管理员关系数据冲突')
        }
        const avatarFileId = String(users[0].avatar_url || '').trim()
        const normalizedPrefix = String(storageFileIdPrefix || '').replace(/\/+$/, '')
        const avatarPrefix = `${normalizedPrefix}/users/${userId}/avatars/`
        if (normalizedPrefix && isCloudFileId(avatarFileId) && avatarFileId.startsWith(avatarPrefix) && !avatarFileId.slice(avatarPrefix.length).includes('/')) {
          await connection.execute("INSERT IGNORE INTO storage_cleanup_jobs (file_id, kind) VALUES (?, 'avatar')", [avatarFileId])
        }
        await connection.execute("UPDATE family_members SET status = 'left', nickname = '已注销成员' WHERE user_id = ?", [userId])
        const [deleted] = await connection.execute('DELETE FROM users WHERE id = ?', [userId])
        if (!deleted.affectedRows) throw new HttpError(409, '账号状态已变化，请重新登录', 'ACCOUNT_DELETE_CONFLICT')
        await connection.commit()
        return { deleted: true }
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    }
  }
}

module.exports = { createAuthService, findOrCreateWechatUser, mapWechatAuthError, assertWechatCode }
