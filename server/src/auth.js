const jwt = require('jsonwebtoken')
const JWT_ALGORITHM = 'HS256'

function createToken(user, secret) {
  return jwt.sign({ userId: user.id }, secret, { algorithm: JWT_ALGORITHM, expiresIn: '7d' })
}

function readToken(token, secret) {
  const payload = jwt.verify(token, secret, { algorithms: [JWT_ALGORITHM] })
  if (!payload || !payload.userId) throw new Error('JWT user id missing')
  return { userId: payload.userId }
}

module.exports = { createToken, readToken }
