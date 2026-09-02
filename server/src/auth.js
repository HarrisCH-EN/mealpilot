const jwt = require('jsonwebtoken')

function createToken(user, secret) {
  return jwt.sign({ userId: user.id, openid: user.openid }, secret, { expiresIn: '7d' })
}

function readToken(token, secret) {
  const payload = jwt.verify(token, secret)
  return { userId: payload.userId, openid: payload.openid }
}

module.exports = { createToken, readToken }

