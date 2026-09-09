const jwt = require('jsonwebtoken')
const JWT_ALGORITHM = 'HS256'

function createToken(user, secret) {
  return jwt.sign({ userId: user.id, openid: user.openid }, secret, { algorithm: JWT_ALGORITHM, expiresIn: '7d' })
}

function readToken(token, secret) {
  const payload = jwt.verify(token, secret, { algorithms: [JWT_ALGORITHM] })
  return { userId: payload.userId, openid: payload.openid }
}

module.exports = { createToken, readToken }
