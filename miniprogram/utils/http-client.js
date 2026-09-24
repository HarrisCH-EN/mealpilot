function createTransportError(error, fallback = '网络请求失败') {
  const message = String(
    error && (error.errMsg || error.message) || fallback
  ).trim()

  const wrapped = new Error(message || fallback)

  wrapped.code =
    error && error.code ||
    'NETWORK_REQUEST_FAILED'

  wrapped.errMsg =
    error && error.errMsg ||
    ''

  if (error && error.statusCode) wrapped.status = Number(error.statusCode) || 0

  return wrapped
}

function createHttpError(response, fallbackMessage = '请求失败') {
  const body = response && response.data && typeof response.data === 'object' ? response.data : {}
  const error = new Error(body.message || fallbackMessage)
  error.status = Number(response && response.statusCode) || 0
  error.code = body.code || ''
  error.errMsg = response && response.errMsg || ''
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

function normalizeCloudPath(prefix, path) {
  const normalizedPrefix = String(prefix || '/api').trim().replace(/\/+$/, '') || '/api'
  const normalizedPath = `/${String(path || '').replace(/^\/+/, '')}`
  return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`)
    ? normalizedPath
    : normalizedPrefix + normalizedPath
}

function createHttpClient({
  baseUrl,
  transport = 'http',
  cloudEnvId = '',
  cloudServiceName = '',
  cloudApiPrefix = '/api',
  store,
  wxApi = typeof wx === 'undefined' ? null : wx,
  reauthenticate = null,
  onAuthenticationFailure = null
} = {}) {
  let reauthPromise = null

  function callTransport(payload) {
    return new Promise((resolve, reject) => {
      const isCloud = transport === 'cloud'
      const api = isCloud ? wxApi && wxApi.cloud && wxApi.cloud.callContainer : wxApi && wxApi.request
      if (typeof api !== 'function') {
        const code = isCloud ? 'CLOUD_TRANSPORT_UNAVAILABLE' : 'HTTP_TRANSPORT_UNAVAILABLE'
        reject(createTransportError({ code }, isCloud ? '微信云容器 API 不可用' : '微信网络 API 不可用'))
        return
      }
      try {
        api.call(isCloud ? wxApi.cloud : wxApi, {
          ...payload,
          ...(isCloud ? { config: { env: cloudEnvId }, path: normalizeCloudPath(cloudApiPrefix, payload.path) } : { url: baseUrl + payload.path }),
          success: resolve,
          fail: (error) => reject(createTransportError(error))
        })
      } catch (error) {
        reject(createTransportError(error))
      }
    })
  }

  function headersFor(token, extra = {}) {
    const headers = { ...extra }
    if (transport === 'cloud') headers['X-WX-SERVICE'] = cloudServiceName
    if (token) headers.Authorization = 'Bearer ' + token
    return headers
  }

  function recoverAuthentication() {
    if (!reauthenticate) return Promise.reject(Object.assign(new Error('登录已失效，请重新登录'), { status: 401, code: 'AUTH_SESSION_EXPIRED' }))
    if (!reauthPromise) reauthPromise = Promise.resolve().then(() => reauthenticate()).finally(() => { reauthPromise = null })
    return reauthPromise
  }

  async function request(path, method = 'GET', data = {}, options = {}) {
    const token = store && store.getState ? store.getState().token : ''
    const isAuthEndpoint = /^\/auth\/(wechat-login|dev-login)$/.test(path)
    if (!options.skipAuth && !isAuthEndpoint && !token) {
      return Promise.reject(Object.assign(new Error('请先登录'), { status: 401, code: 'AUTH_REQUIRED' }))
    }
    try {
      const response = await callTransport({
        method,
        data,
        path,
        header: headersFor(token, options.header || {})
      })
      if (response.statusCode >= 200 && response.statusCode < 300 && (!response.data || response.data.ok !== false)) {
        return response.data && Object.prototype.hasOwnProperty.call(response.data, 'data') ? response.data.data : response.data
      }
      const error = createHttpError(response)
      if (error.status !== 401 || options.skipReauth || options.retried) throw error
      try {
        await recoverAuthentication()
        return await request(path, method, data, { ...options, skipReauth: true, retried: true })
      } catch (_reauthError) {
        if (store && typeof store.clear === 'function') store.clear()
        const expired = Object.assign(new Error('登录已失效，请重新登录'), { status: 401, code: 'AUTH_SESSION_EXPIRED' })
        if (typeof onAuthenticationFailure === 'function') onAuthenticationFailure(expired)
        throw expired
      }
    } catch (error) {
      throw error && (error.status !== undefined || error.code === 'AUTH_REQUIRED' || error.code === 'AUTH_SESSION_EXPIRED')
        ? error
        : createTransportError(error)
    }
  }

  function uploadToCloud(cloudPath, filePath) {
    return new Promise((resolve, reject) => {
      const cloud = wxApi && wxApi.cloud
      if (!cloud || typeof cloud.uploadFile !== 'function') {
        reject(createTransportError({ code: 'CLOUD_UPLOAD_UNAVAILABLE' }, '微信云存储上传 API 不可用'))
        return
      }
      try {
        cloud.uploadFile({
          cloudPath,
          filePath,
          success: (result) => {
            const fileId = result && (result.fileID || result.fileId)
            if (!fileId) return reject(createTransportError({ code: 'CLOUD_UPLOAD_INVALID_RESPONSE' }, '云存储未返回 File ID'))
            resolve(fileId)
          },
          fail: (error) => reject(createTransportError(error))
        })
      } catch (error) {
        reject(createTransportError(error))
      }
    })
  }

  async function performUpload(path, filePath, token, options = {}) {
    if (transport === 'cloud') {
      const prepared = await request(path + '/prepare', 'POST', {}, options)
      if (!prepared || !prepared.cloudPath) throw createTransportError({ code: 'CLOUD_PREPARE_INVALID_RESPONSE' }, '上传准备响应无效')
      const fileId = await uploadToCloud(prepared.cloudPath, filePath)
      return request(path + '/commit', 'POST', { fileId }, options)
    }
    return new Promise((resolve, reject) => {
      if (!wxApi || typeof wxApi.uploadFile !== 'function') {
        reject(createTransportError({ code: 'HTTP_UPLOAD_UNAVAILABLE' }, '微信上传 API 不可用'))
        return
      }
      try {
        wxApi.uploadFile({
          url: baseUrl + path,
          filePath,
          name: 'file',
          header: headersFor(token),
          success: resolve,
          fail: (error) => reject(createTransportError(error))
        })
      } catch (error) {
        reject(createTransportError(error))
      }
    })
  }

  async function upload(path, filePath, fallbackMessage = '上传失败', options = {}) {
    const token = store && store.getState ? store.getState().token : ''
    if (!token && !options.skipAuth) return Promise.reject(Object.assign(new Error('请先登录'), { status: 401, code: 'AUTH_REQUIRED' }))
    if (transport === 'cloud') return performUpload(path, filePath, token, options)
    try {
      const response = await performUpload(path, filePath, token)
      return parseUploadResponse(response, fallbackMessage)
    } catch (error) {
      if (error.status !== 401 || options.skipReauth || options.retried) throw error
      try {
        await recoverAuthentication()
        return upload(path, filePath, fallbackMessage, { ...options, skipReauth: true, retried: true })
      } catch (_reauthError) {
        if (store && typeof store.clear === 'function') store.clear()
        const expired = Object.assign(new Error('登录已失效，请重新登录'), { status: 401, code: 'AUTH_SESSION_EXPIRED' })
        if (typeof onAuthenticationFailure === 'function') onAuthenticationFailure(expired)
        throw expired
      }
    }
  }

  return { request, upload, parseUploadResponse }
}

module.exports = { createHttpClient, createHttpError, parseUploadResponse, createTransportError, normalizeCloudPath }
