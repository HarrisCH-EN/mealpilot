function safeAuthError(error, fallbackMessage = '登录失败，请重试') {
  const safe = new Error(error && error.message && !/secret|session_key|provider/i.test(error.message) ? error.message : fallbackMessage)
  safe.status = Number(error && error.status) || 0
  safe.code = error && error.code || 'AUTH_FAILED'
  return safe
}

function createAuthService({ store, wechatAuth, httpClient, allowDevLogin = false } = {}) {
  let reauthPromise = null
  let restorePromise = null
  let logoutVersion = 0

  async function loginWithWechat() {
    const version = logoutVersion
    store.setAuthenticating()
    try {
      const code = await wechatAuth.getLoginCode()
      if (version !== logoutVersion) throw Object.assign(new Error('登录已取消'), { code: 'AUTH_CANCELLED' })
      const session = await httpClient.request('/auth/wechat-login', 'POST', { code }, { skipAuth: true, skipReauth: true })
      if (!session || !session.token) throw Object.assign(new Error('登录响应无效'), { code: 'AUTH_INVALID_RESPONSE' })
      store.setSession(session)
      return store.getState()
    } catch (error) {
      const safe = safeAuthError(error)
      store.setUnauthenticated(safe.code)
      throw safe
    }
  }

  function reauthenticate() {
    if (!reauthPromise) reauthPromise = loginWithWechat().finally(() => { reauthPromise = null })
    return reauthPromise
  }

  async function restoreSessionOnce() {
    const version = logoutVersion
    const currentSession = store.getState()
    const token = currentSession.token
    if (!token) {
      store.setUnauthenticated()
      return store.getState()
    }
    if (currentSession.status !== 'authenticated') store.setAuthenticating()
    try {
      const session = await httpClient.request('/auth/me', 'GET', {}, { skipReauth: true })
      if (version !== logoutVersion) return store.getState()
      store.setSession(session)
      return store.getState()
    } catch (error) {
      if (version !== logoutVersion) return store.getState()
      if (Number(error && error.status) !== 401) {
        const safe = safeAuthError(error, '登录状态恢复失败，请重试')
        store.setAuthError(safe.code)
        throw safe
      }
      try {
        return await reauthenticate()
      } catch (reauthError) {
        store.clear()
        throw safeAuthError(reauthError, '登录已失效，请重新登录')
      }
    }
  }

  function restoreSession() {
    if (!restorePromise) restorePromise = restoreSessionOnce().finally(() => { restorePromise = null })
    return restorePromise
  }

  async function bootstrap() {
    if (store.getState().status === 'unknown') store.hydrate()
    return restoreSession()
  }

  async function devLogin() {
    if (!allowDevLogin) throw Object.assign(new Error('本地开发登录未启用'), { code: 'AUTH_DEV_DISABLED', status: 404 })
    store.setAuthenticating()
    try {
      const session = await httpClient.request('/auth/dev-login', 'POST', { openid: 'demo-owner', displayName: '演示用户' }, { skipAuth: true, skipReauth: true })
      store.setSession(session)
      return store.getState()
    } catch (error) {
      const safe = safeAuthError(error, '本地开发登录失败，请重试')
      store.setUnauthenticated(safe.code)
      throw safe
    }
  }

  async function logout() {
    logoutVersion += 1
    store.clear()
  }

  return { bootstrap, loginWithWechat, reauthenticate, restoreSession, logout, devLogin }
}

module.exports = { createAuthService, safeAuthError }
