const express = require('express')
const { requireFields } = require('../http')

const asyncRoute = (handler) => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)

function router({ authService, auth, devAuthEnabled }) {
  const result = express.Router()

  result.post('/auth/wechat-login', asyncRoute(async (request, response) => {
    const data = await authService.loginOrRegister(request.body && request.body.code)
    response.json({ ok: true, data })
  }))

  result.post('/auth/dev-login', asyncRoute(async (request, response) => {
    if (!devAuthEnabled) return response.status(404).json({ ok: false, message: '开发登录未启用' })
    const data = await authService.loginWithDev(request.body || {})
    response.json({ ok: true, data })
  }))

  result.get('/auth/me', auth, asyncRoute(async (request, response) => {
    response.json({ ok: true, data: await authService.getSession({ user: request.user }) })
  }))

  result.patch('/auth/profile', auth, asyncRoute(async (request, response) => {
    requireFields(request.body, ['displayName'])
    response.json({ ok: true, data: await authService.updateProfile({ userId: request.user.id, displayName: request.body.displayName }) })
  }))

  return result
}

module.exports = { router }
