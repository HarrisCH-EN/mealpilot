const { apiBaseUrl, allowDevLogin } = require('../config')
const app = getApp()
let authPromise = null

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

function request(path, method = 'GET', data = {}, options = {}) {
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
          await reauthenticate()
          return resolve(await request(path, method, data, { ...options, skipReauth: true }))
        } catch (reauthError) {
          if (typeof app.clearSession === 'function') app.clearSession()
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
    updateAuthState({ authReady: true, authenticating: false, authError: null })
    return data
  } catch (error) {
    const safeError = toSafeAuthError(error)
    updateAuthState({ authReady: true, authenticating: false, authError: safeError.message })
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
  if (options.force === true) return authenticateWithWechat()
  const token = app.globalData.token || wx.getStorageSync('token') || ''
  if (!token) return authenticateWithWechat()
  updateAuthState({ authenticating: true, authError: null })
  try {
    const session = await request('/auth/me')
    app.setSession(session)
    updateAuthState({ authReady: true, authenticating: false, authError: null })
    return session
  } catch (error) {
    const safeError = toSafeAuthError(error)
    updateAuthState({ authReady: true, authenticating: false, authError: safeError.message })
    throw safeError
  }
}

async function devLogin() {
  if (!allowDevLogin) throw new Error('本地开发登录未启用')
  updateAuthState({ authenticating: true, authError: null })
  try {
    const data = await request('/auth/dev-login', 'POST', { openid: 'demo-owner', displayName: '演示用户' }, { skipReauth: true })
    app.setSession(data)
    updateAuthState({ authReady: true, authenticating: false, authError: null })
    return data
  } catch (error) {
    const safeError = toSafeAuthError(error)
    updateAuthState({ authReady: true, authenticating: false, authError: safeError.message })
    throw safeError
  }
}
function uploadFile(filePath) {
  return new Promise((resolve, reject) => wx.uploadFile({
    url: apiBaseUrl + '/uploads/recipe-cover',
    filePath,
    name: 'file',
    header: app.globalData.token ? { Authorization: 'Bearer ' + app.globalData.token } : {},
    success: (res) => {
      let body = {}
      try { body = typeof res.data === 'string' ? JSON.parse(res.data) : (res.data || {}) } catch (_error) { reject(new Error('上传响应格式不正确')); return }
      if (res.statusCode >= 200 && res.statusCode < 300 && body.ok !== false) return resolve(body.data)
      const error = new Error(body.message || '上传失败')
      error.status = res.statusCode
      reject(error)
    },
    fail: reject
  }))
}
function resolveCoverUrl(coverUrl) {
  const value = String(coverUrl || '').trim()
  return value.startsWith('/uploads/') ? apiBaseUrl.replace(/\/api\/?$/, '') + value : value
}
function isNoActiveFamilyError(error) {
  return Number(error && error.status) === 403 && /创建或加入家庭|active Family/.test(String(error && error.message || ''))
}
module.exports = { request, wechatLogin, ensureAuthenticated, devLogin, uploadFile, resolveCoverUrl, isNoActiveFamilyError }
