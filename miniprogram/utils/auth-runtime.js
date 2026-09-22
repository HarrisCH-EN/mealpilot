const { apiBaseUrl, allowDevLogin } = require('../config')
const { createAuthStore } = require('./auth-store')
const { createWechatAuth } = require('./wechat-auth')
const { createHttpClient } = require('./http-client')
const { createAuthService } = require('./auth-service')
const { createRouteGuard } = require('./route-guard')

const app = typeof getApp === 'function' ? getApp() : null
const wxApi = typeof wx === 'undefined' ? null : wx
const store = createAuthStore({
  storage: wxApi || {},
  onChange(state) {
    if (!app || !app.globalData) return
    Object.assign(app.globalData, {
      token: state.token,
      user: state.user,
      membership: state.membership,
      profileComplete: state.profileComplete,
      authReady: state.status !== 'unknown' && state.status !== 'authenticating',
      authenticating: state.status === 'authenticating',
      authError: state.authError
    })
  }
})
let authService
const httpClient = createHttpClient({
  baseUrl: apiBaseUrl,
  store,
  wxApi,
  reauthenticate: () => authService.reauthenticate()
})
authService = createAuthService({ store, wechatAuth: createWechatAuth({ wxApi }), httpClient, allowDevLogin })
const routeGuard = createRouteGuard({ store, wxApi })
store.hydrate()

module.exports = { store, httpClient, authService, routeGuard }
