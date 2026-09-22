const { apiBaseUrl } = require('../../config')
const { httpClient, authService, routeGuard } = require('../auth-runtime')

function resolveCoverUrl(value) {
  const url = String(value || '').trim()
  return url.startsWith('/uploads/') ? apiBaseUrl.replace(/\/api\/?$/, '') + url : url
}

function isNoActiveFamilyError(error) {
  return Number(error && error.status) === 403 && /创建或加入家庭|active Family/.test(String(error && error.message || ''))
}

module.exports = {
  request: httpClient.request,
  uploadFile: (filePath, options) => httpClient.upload('/uploads/recipe-cover', filePath, '上传失败', options),
  uploadAvatar: (filePath, options) => httpClient.upload('/uploads/avatar', filePath, '头像上传失败', options),
  ensureAuthenticated: authService.bootstrap,
  requireAuthentication: routeGuard.requireAuthentication,
  resolveCoverUrl,
  isNoActiveFamilyError
}
