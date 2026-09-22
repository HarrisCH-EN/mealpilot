function createHttpError(response, fallbackMessage = '请求失败') {
  const body = response && response.data && typeof response.data === 'object' ? response.data : {}
  const error = new Error(body.message || fallbackMessage)
  error.status = Number(response && response.statusCode) || 0
  error.code = body.code || ''
  return error
}

function parseUploadResponse(response, fallbackMessage) {
  let body = {}
  try {
    body = typeof response.data === 'string' ? JSON.parse(response.data) : (response.data || {})
  } catch (_error) {
    throw Object.assign(new Error('上传响应格式不正确'), { status: response.statusCode || 0, code: 'HTTP_INVALID_RESPONSE' })
  }
  if (response.statusCode >= 200 && response.statusCode < 300 && body.ok !== false) return body.data
  const error = new Error(body.message || fallbackMessage)
  error.status = Number(response.statusCode) || 0
  error.code = body.code || ''
  throw error
}

function createHttpClient({ baseUrl, store, wxApi = typeof wx === 'undefined' ? null : wx, reauthenticate = null, onAuthenticationFailure = null } = {}) {
  let reauthPromise = null

  function recoverAuthentication() {
    if (!reauthenticate) return Promise.reject(Object.assign(new Error('登录已失效，请重新登录'), { status: 401, code: 'AUTH_SESSION_EXPIRED' }))
    if (!reauthPromise) reauthPromise = Promise.resolve().then(() => reauthenticate()).finally(() => { reauthPromise = null })
    return reauthPromise
  }

  function request(path, method = 'GET', data = {}, options = {}) {
    const token = store && store.getState ? store.getState().token : ''
    const isAuthEndpoint = /^\/auth\/(wechat-login|dev-login)$/.test(path)
    if (!options.skipAuth && !isAuthEndpoint && !token) {
      return Promise.reject(Object.assign(new Error('请先登录'), { status: 401, code: 'AUTH_REQUIRED' }))
    }
    if (!wxApi || typeof wxApi.request !== 'function') return Promise.reject(new Error('微信网络 API 不可用'))
    return new Promise((resolve, reject) => wxApi.request({
      url: baseUrl + path,
      method,
      data,
      header: token ? { Authorization: 'Bearer ' + token } : {},
      success: async (response) => {
        if (response.statusCode >= 200 && response.statusCode < 300 && (!response.data || response.data.ok !== false)) {
          return resolve(response.data && Object.prototype.hasOwnProperty.call(response.data, 'data') ? response.data.data : response.data)
        }
        const error = createHttpError(response)
        if (error.status !== 401 || options.skipReauth || options.retried) return reject(error)
        try {
          await recoverAuthentication()
          return resolve(await request(path, method, data, { ...options, skipReauth: true, retried: true }))
        } catch (_reauthError) {
          if (store && typeof store.clear === 'function') store.clear()
          const expired = Object.assign(new Error('登录已失效，请重新登录'), { status: 401, code: 'AUTH_SESSION_EXPIRED' })
          if (typeof onAuthenticationFailure === 'function') onAuthenticationFailure(expired)
          return reject(expired)
        }
      },
      fail: reject
    }))
  }

  function upload(path, filePath, fallbackMessage = '上传失败', options = {}) {
    const token = store && store.getState ? store.getState().token : ''
    if (!token && !options.skipAuth) return Promise.reject(Object.assign(new Error('请先登录'), { status: 401, code: 'AUTH_REQUIRED' }))
    if (!wxApi || typeof wxApi.uploadFile !== 'function') return Promise.reject(new Error('微信上传 API 不可用'))
    return new Promise((resolve, reject) => wxApi.uploadFile({
      url: baseUrl + path,
      filePath,
      name: 'file',
      header: token ? { Authorization: 'Bearer ' + token } : {},
      success: async (response) => {
        try {
          return resolve(parseUploadResponse(response, fallbackMessage))
        } catch (error) {
          if (error.status !== 401 || options.skipReauth || options.retried) return reject(error)
          try {
            await recoverAuthentication()
            return resolve(await upload(path, filePath, fallbackMessage, { ...options, skipReauth: true, retried: true }))
          } catch (_reauthError) {
            if (store && typeof store.clear === 'function') store.clear()
            const expired = Object.assign(new Error('登录已失效，请重新登录'), { status: 401, code: 'AUTH_SESSION_EXPIRED' })
            if (typeof onAuthenticationFailure === 'function') onAuthenticationFailure(expired)
            return reject(expired)
          }
        }
      },
      fail: reject
    }))
  }

  return { request, upload, parseUploadResponse }
}

module.exports = { createHttpClient, createHttpError, parseUploadResponse }
