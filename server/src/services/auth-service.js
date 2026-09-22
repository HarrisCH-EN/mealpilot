const { HttpError } = require('../http')
const { WechatAuthError } = require('./wechat-auth-service')
const { presentUser, presentSession } = require('./auth-session')

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

function createAuthService({ database, jwtSecret, wechatAuthService, mediaUrlService } = {}) {
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
    }
  }
}

module.exports = { createAuthService, findOrCreateWechatUser, mapWechatAuthError, assertWechatCode }
