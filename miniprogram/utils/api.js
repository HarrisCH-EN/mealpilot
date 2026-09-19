const { apiBaseUrl, allowDevLogin } = require('../config')
const app = getApp()
let authPromise = null
let loginRedirecting = false
let profileRedirecting = false
const PROFILE_SETUP_ROUTE = '/pages/profile-setup/index'
const MAIN_ROUTE = '/pages/recommend/index'

function updateAuthState(patch) {
  if (typeof app.setAuthState === 'function') app.setAuthState(patch)
  else if (app.globalData) Object.assign(app.globalData, patch)
}

function normalizeAuthError(error) {
  const status = Number(error && error.status)
  if (status === 401) return '登录已失效，请重新登录'
  if (status === 503) return '网络异常，请稍后重试'
  if (status >= 500) return '登录服务暂时不可用，请稍后重试'
  return '登录失败，请重试'
}

function toSafeAuthError(error) {
  const safeError = new Error(normalizeAuthError(error))
  if (Number(error && error.status)) safeError.status = Number(error.status)
  return safeError
}

function readToken() {
  const token = app.globalData.token || wx.getStorageSync('token') || ''
  if (token && !app.globalData.token) app.globalData.token = token
  return token
}

function redirectToLogin() {
  if (typeof app.clearSession === 'function') app.clearSession()
  let currentRoute = ''
  try {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    currentRoute = pages.length ? String(pages[pages.length - 1].route || '') : ''
  } catch (_error) {
    currentRoute = ''
  }
  if (currentRoute === 'pages/login/index' || currentRoute === '/pages/login/index') {
    loginRedirecting = false
    return
  }
  if (loginRedirecting || typeof wx.reLaunch !== 'function') return
  loginRedirecting = true
  wx.reLaunch({ url: '/pages/login/index' })
}

function redirectToProfileSetup() {
  let currentRoute = ''
  try {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    currentRoute = pages.length ? String(pages[pages.length - 1].route || '') : ''
  } catch (_error) {
    currentRoute = ''
  }
  if (currentRoute === 'pages/profile-setup/index' || currentRoute === PROFILE_SETUP_ROUTE) {
    profileRedirecting = false
    return
  }
  if (profileRedirecting || typeof wx.reLaunch !== 'function') return
  profileRedirecting = true
  wx.reLaunch({ url: PROFILE_SETUP_ROUTE })
}

function nextRouteForSession(session) {
  return session && session.profileComplete === true ? MAIN_ROUTE : PROFILE_SETUP_ROUTE
}

function requireAuthentication() {
  if (readToken() && app.globalData.authReady === true && app.globalData.profileComplete === true) return true
  if (readToken() && app.globalData.authReady === true && app.globalData.profileComplete === false) {
    redirectToProfileSetup()
    return false
  }
  redirectToLogin()
  return false
}

function request(path, method = 'GET', data = {}, options = {}) {
  const isAuthRequest = /^\/auth\/(wechat-login|dev-login)$/.test(path)
  if (!isAuthRequest && !options.skipAuth && !readToken()) {
    const error = Object.assign(new Error('登录已失效，请重新登录'), { status: 401 })
    redirectToLogin()
    return Promise.reject(error)
  }
  return new Promise((resolve, reject) => wx.request({
    url: apiBaseUrl + path,
    method,
    data,
    header: app.globalData.token ? { Authorization: 'Bearer ' + app.globalData.token } : {},
    success: async (res) => {
      const body = res.data || {}
      if (res.statusCode >= 200 && res.statusCode < 300 && body.ok !== false) return resolve(body.data)
      const error = new Error(body.message || '请求失败')
      error.status = res.statusCode
      if (res.statusCode === 401 && !options.skipReauth && !/^\/auth\/(wechat-login|dev-login)$/.test(path)) {
        try {
          const session = await reauthenticate()
          if (!session || session.profileComplete !== true) {
            const profileError = Object.assign(new Error('请先完善个人资料'), { code: 'PROFILE_REQUIRED', status: 409 })
            redirectToProfileSetup()
            reject(profileError)
            return
          }
          return resolve(await request(path, method, data, { ...options, skipReauth: true }))
        } catch (reauthError) {
          if (typeof app.clearSession === 'function') app.clearSession()
          redirectToLogin()
          reject(reauthError)
          return
        }
      }
      reject(error)
    },
    fail: reject
  }))
}
function wxLoginCode() {
  return new Promise((resolve, reject) => wx.login({
    success: (result) => result && typeof result.code === 'string' && result.code.trim()
      ? resolve(result.code.trim())
      : reject(Object.assign(new Error('微信登录未返回有效凭证'), { status: 401 })),
    fail: reject
  }))
}

async function performWechatLogin() {
  updateAuthState({ authenticating: true, authError: null })
  try {
    const code = await wxLoginCode()
    const data = await request('/auth/wechat-login', 'POST', { code }, { skipReauth: true })
    if (!data || !data.token) throw new Error('登录响应无效')
    app.setSession(data)
    loginRedirecting = false
    updateAuthState({ authReady: true, authenticating: false, authError: null })
    return data
  } catch (error) {
    const safeError = toSafeAuthError(error)
    updateAuthState({ authReady: true, authenticating: false, authError: safeError.message })
    if (safeError.status === 401) redirectToLogin()
    throw safeError
  }
}

function authenticateWithWechat() {
  if (!authPromise) authPromise = performWechatLogin().finally(() => { authPromise = null })
  return authPromise
}

function wechatLogin() {
  return authenticateWithWechat()
}

function reauthenticate() {
  return authenticateWithWechat()
}

async function ensureAuthenticated(options = {}) {
  if (options.force === true) {
    try {
      return await authenticateWithWechat()
    } catch (error) {
      if (Number(error && error.status) === 401) redirectToLogin()
      throw error
    }
  }
  const token = readToken()
  if (!token) {
    try {
      return await authenticateWithWechat()
    } catch (error) {
      redirectToLogin()
      throw error
    }
  }
  updateAuthState({ authenticating: true, authError: null })
  try {
    const session = await request('/auth/me')
    app.setSession(session)
    updateAuthState({ authReady: true, authenticating: false, authError: null })
    return session
  } catch (error) {
    const safeError = toSafeAuthError(error)
    updateAuthState({ authReady: true, authenticating: false, authError: safeError.message })
    if (safeError.status === 401) redirectToLogin()
    throw safeError
  }
}

async function devLogin() {
  if (!allowDevLogin) throw new Error('本地开发登录未启用')
  updateAuthState({ authenticating: true, authError: null })
  try {
    const data = await request('/auth/dev-login', 'POST', { openid: 'demo-owner', displayName: '演示用户' }, { skipReauth: true })
    app.setSession(data)
    loginRedirecting = false
    updateAuthState({ authReady: true, authenticating: false, authError: null })
    return data
  } catch (error) {
    const safeError = toSafeAuthError(error)
    updateAuthState({ authReady: true, authenticating: false, authError: safeError.message })
    throw safeError
  }
}
function parseUploadResponse(res, fallbackMessage) {
  let body = {}
  try {
    body = typeof res.data === 'string' ? JSON.parse(res.data) : (res.data || {})
  } catch (_error) {
    return { error: new Error('上传响应格式不正确') }
  }
  if (res.statusCode >= 200 && res.statusCode < 300 && body.ok !== false) return { data: body.data }
  const error = new Error(body.message || fallbackMessage)
  error.status = res.statusCode
  return { error }
}

function uploadRequest(path, filePath, fallbackMessage, options = {}) {
  return new Promise((resolve, reject) => wx.uploadFile({
    url: apiBaseUrl + path,
    filePath,
    name: 'file',
    header: readToken() ? { Authorization: 'Bearer ' + readToken() } : {},
    success: async (res) => {
      const result = parseUploadResponse(res, fallbackMessage)
      if (!result.error) return resolve(result.data)
      if (result.error.status !== 401 || options.skipReauth) return reject(result.error)
      try {
        const session = await reauthenticate()
        if (!session || session.profileComplete !== true) {
          const profileError = Object.assign(new Error('请先完善个人资料'), {
            code: 'PROFILE_REQUIRED',
            status: 409
          })
          redirectToProfileSetup()
          reject(profileError)
          return
        }
        resolve(await uploadRequest(path, filePath, fallbackMessage, { ...options, skipReauth: true }))
      } catch (error) {
        if (typeof app.clearSession === 'function') app.clearSession()
        redirectToLogin()
        reject(error)
      }
    },
    fail: reject
  }))
}

function uploadFile(filePath) {
  return uploadRequest('/uploads/recipe-cover', filePath, '上传失败')
}

function uploadAvatar(filePath) {
  return uploadRequest('/uploads/avatar', filePath, '头像上传失败')
}
function resolveCoverUrl(coverUrl) {
  const value = String(coverUrl || '').trim()
  return value.startsWith('/uploads/') ? apiBaseUrl.replace(/\/api\/?$/, '') + value : value
}
function isNoActiveFamilyError(error) {
  return Number(error && error.status) === 403 && /创建或加入家庭|active Family/.test(String(error && error.message || ''))
}
module.exports = { request, wechatLogin, ensureAuthenticated, devLogin, uploadFile, uploadAvatar, resolveCoverUrl, isNoActiveFamilyError, redirectToLogin, redirectToProfileSetup, nextRouteForSession, requireAuthentication }
