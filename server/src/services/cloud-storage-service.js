function storageError(stage) {
  const error = new Error(`CloudBase Storage ${stage} failed`)
  error.code = `CLOUDBASE_STORAGE_${stage.toUpperCase()}_FAILED`
  return error
}

function failureStage(error) {
  const detail = `${error && error.code || ''} ${error && error.message || ''} ${error && error.statusCode || ''}`.toLowerCase()
  if (/credential|secret|signature|token|unauthoriz|authentication|401/.test(detail)) return 'auth'
  if (/permission|forbidden|accessdenied|access denied|403/.test(detail)) return 'permission'
  if (/not.?found|no.?such|404/.test(detail)) return 'not_found'
  return 'download'
}

function createCloudStorageService({ envId, probeFileId, sdk } = {}) {
  let app
  return {
    async readProbe() {
      if (!app) {
        if (!envId || !probeFileId) throw storageError('init')
        try {
          const cloudbase = sdk || require('@cloudbase/node-sdk')
          app = cloudbase.init({ env: envId })
          if (!app || typeof app.downloadFile !== 'function') throw new Error('invalid SDK instance')
        } catch (_error) {
          throw storageError('init')
        }
      }
      let result
      try {
        result = await app.downloadFile({ fileID: probeFileId })
      } catch (error) {
        throw storageError(failureStage(error))
      }
      if (result && result.code) throw storageError(failureStage(result))
      if (!result || !Buffer.isBuffer(result.fileContent) || result.fileContent.length === 0) throw storageError('download')
      return result.fileContent.length
    }
  }
}

module.exports = { createCloudStorageService }
