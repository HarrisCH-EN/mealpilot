const { readToken } = require('../auth')
const { HttpError } = require('../http')

function authenticate({ database, jwtSecret }) {
  return async (request, _response, next) => {
    try {
      const header = request.headers.authorization || ''
      if (!header.startsWith('Bearer ')) throw new HttpError(401, '请先登录')
      const session = readToken(header.slice(7), jwtSecret)
      const [rows] = await database.execute('SELECT id, openid, display_name, avatar_url FROM users WHERE id = ?', [session.userId])
      if (!rows[0]) throw new HttpError(401, '登录已失效')
      request.user = rows[0]
      next()
    } catch (error) {
      next(error.status ? error : new HttpError(401, '登录已失效'))
    }
  }
}

async function currentMembership(database, userId) {
  const [rows] = await database.execute(
    `SELECT fm.id AS member_id, fm.family_id, fm.role, fm.nickname, f.name AS family_name, f.invite_code
     FROM family_members fm JOIN families f ON f.id = fm.family_id
     WHERE fm.user_id = ? AND fm.status = 'active' LIMIT 1`,
    [userId]
  )
  return rows[0] || null
}

function requireFamily(database) {
  return async (request, _response, next) => {
    try {
      const membership = await currentMembership(database, request.user.id)
      if (!membership) throw new HttpError(403, '请先创建或加入家庭')
      request.membership = membership
      next()
    } catch (error) { next(error) }
  }
}

module.exports = { authenticate, currentMembership, requireFamily }
