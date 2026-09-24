const MAX_TEMP_URL_BATCH = 50

function storageError(stage) {
  const normalized = String(stage || 'operation').toLowerCase()
  const error = new Error(`CloudBase Storage ${normalized} failed`)
  error.code = `CLOUDBASE_STORAGE_${normalized.toUpperCase()}_FAILED`
  return error
}

function failureStage(error, fallback = 'operation') {
  const detail = `${error && error.code || ''} ${error && error.message || ''} ${error && error.statusCode || ''}`.toLowerCase()
  if (/credential|secret|signature|token|unauthoriz|authentication|401/.test(detail)) return 'auth'
  if (/permission|forbidden|accessdenied|access denied|403/.test(detail)) return 'permission'
  if (/not.?found|no.?such|404/.test(detail)) return 'not_found'
  return fallback
}

function isCloudFileId(value) {
  return typeof value === 'string' && value.startsWith('cloud://')
}

function normalizePrefix(prefix) {
  return String(prefix || '').trim().replace(/\/+$/, '')
}

function validateFileIdPrefix(prefix) {
  const normalized = normalizePrefix(prefix)
  if (!/^cloud:\/\/[^/]+(?:\/[^/]*)*$/.test(normalized)) throw storageError('path')
  return normalized
}

function createCloudStorageService({ envId, fileIdPrefix, sdk } = {}) {
  let app

  function getApp() {
    if (app) return app
    if (!String(envId || '').trim() || !normalizePrefix(fileIdPrefix)) throw storageError('init')
    try {
      const cloudbase = sdk || require('@cloudbase/node-sdk')
      app = cloudbase.init({ env: envId })
      if (!app || typeof app.uploadFile !== 'function' || typeof app.getTempFileURL !== 'function' || typeof app.deleteFile !== 'function') throw new Error('invalid SDK instance')
      return app
    } catch (error) {
      throw storageError(failureStage(error, 'init'))
    }
  }

  function fileIdForPath(cloudPath) {
    const relativePath = String(cloudPath || '').trim().replace(/^\/+/, '')
    if (!relativePath || relativePath.includes('..') || relativePath.startsWith('cloud://')) throw storageError('path')
    return `${validateFileIdPrefix(fileIdPrefix)}/${relativePath}`
  }

  async function uploadBuffer({ cloudPath, buffer }) {
    if (!Buffer.isBuffer(buffer)) throw storageError('upload')
    let result
    try {
      result = await getApp().uploadFile({ cloudPath, fileContent: buffer })
    } catch (error) {
      throw storageError(failureStage(error, 'upload'))
    }
    if (!result || result.code) throw storageError(failureStage(result, 'upload'))
    const fileId = result.fileID || result.fileId
    if (!isCloudFileId(fileId)) throw storageError('upload')
    return { fileId }
  }

  async function downloadBuffer(fileId, maxBytes) {
    if (!isCloudFileId(fileId) || !fileId.startsWith(`${validateFileIdPrefix(fileIdPrefix)}/`)) throw storageError('path')
    const app = getApp()
    if (Number.isFinite(maxBytes) && maxBytes > 0) {
      let info
      try {
        info = await app.getFileInfo({ fileList: [fileId] })
      } catch (error) {
        throw storageError(failureStage(error, 'info'))
      }
      const entry = info && Array.isArray(info.fileList) && info.fileList[0]
      if (!entry || entry.fileID !== fileId || entry.code !== 'SUCCESS' || !Number.isSafeInteger(entry.size) || entry.size < 0) throw storageError('info')
      if (entry.size > maxBytes) {
        const error = storageError('size')
        error.status = 413
        throw error
      }
    }
    let result
    try {
      result = await app.downloadFile({ fileID: fileId })
    } catch (error) {
      throw storageError(failureStage(error, 'download'))
    }
    if (!result || result.code || !Buffer.isBuffer(result.fileContent)) throw storageError(failureStage(result, 'download'))
    if (Number.isFinite(maxBytes) && result.fileContent.length > maxBytes) {
      const error = storageError('size')
      error.status = 413
      throw error
    }
    return result.fileContent
  }

  async function getTemporaryUrl(fileId) {
    const result = await getTemporaryUrls([fileId])
    const value = result[fileId]
    if (!value) throw storageError('url')
    return value
  }

  async function getTemporaryUrls(fileIds) {
    const uniqueIds = [...new Set((Array.isArray(fileIds) ? fileIds : []).filter(isCloudFileId))]
    const temporaryUrls = {}
    for (let index = 0; index < uniqueIds.length; index += MAX_TEMP_URL_BATCH) {
      const chunk = uniqueIds.slice(index, index + MAX_TEMP_URL_BATCH)
      let result
      try {
        result = await getApp().getTempFileURL({ fileList: chunk })
      } catch (_error) {
        continue
      }
      if (!result || result.code) continue
      for (const entry of Array.isArray(result.fileList) ? result.fileList : []) {
        const entryId = entry && (entry.fileID || entry.fileId)
        const url = entry && (entry.tempFileURL || entry.tempFileUrl)
        if (isCloudFileId(entryId) && typeof url === 'string' && /^https:\/\//i.test(url)) temporaryUrls[entryId] = url
      }
    }
    return temporaryUrls
  }

  async function deleteFile(fileId) {
    if (!isCloudFileId(fileId)) return
    let result
    try {
      result = await getApp().deleteFile({ fileList: [fileId] })
    } catch (error) {
      throw storageError(failureStage(error, 'delete'))
    }
    const failedEntry = result && Array.isArray(result.fileList) && result.fileList.find((entry) => entry && entry.code && entry.code !== 'SUCCESS')
    if (!result || result.code || failedEntry) throw storageError(failureStage(failedEntry || result, 'delete'))
  }

  return { fileIdForPath, uploadBuffer, downloadBuffer, getTemporaryUrl, getTemporaryUrls, deleteFile }
}

module.exports = { createCloudStorageService, isCloudFileId, storageError, MAX_TEMP_URL_BATCH }
