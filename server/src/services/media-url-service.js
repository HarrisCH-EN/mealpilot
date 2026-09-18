const { isCloudFileId } = require('./cloud-storage-service')

function safeWarning(operation, error) {
  console.warn('[MealPilot Storage Warning]', { operation, errorCode: error && error.code || 'CLOUDBASE_STORAGE_URL_FAILED' })
}

function createMediaUrlService({ storage }) {
  if (!storage || typeof storage.getTemporaryUrls !== 'function') throw new TypeError('storage service is required')

  async function resolveValue(value) {
    const normalized = String(value || '').trim()
    if (!isCloudFileId(normalized)) return normalized
    const urls = await storage.getTemporaryUrls([normalized])
    return urls[normalized] || ''
  }

  async function resolveValues(values) {
    const normalized = (Array.isArray(values) ? values : []).map((value) => String(value || '').trim())
    const cloudIds = [...new Set(normalized.filter(isCloudFileId))]
    let urls = {}
    if (cloudIds.length) {
      try {
        urls = await storage.getTemporaryUrls(cloudIds)
      } catch (error) {
        safeWarning('resolve-temporary-urls', error)
      }
    }
    return normalized.map((value) => isCloudFileId(value) ? (urls[value] || '') : value)
  }

  async function resolveRecord(record, { stableField = 'coverFileId', displayField = 'coverUrl' } = {}) {
    const stableValue = record && record[stableField] !== undefined ? record[stableField] : record && record[displayField]
    const [displayValue] = await resolveValues([stableValue])
    return { ...record, [stableField]: String(stableValue || '').trim(), [displayField]: displayValue }
  }

  async function resolveRecords(records, options) {
    const list = Array.isArray(records) ? records : []
    const stableField = options && options.stableField || 'coverFileId'
    const displayField = options && options.displayField || 'coverUrl'
    const stableValues = list.map((record) => record && record[stableField] !== undefined ? record[stableField] : record && record[displayField])
    const displays = await resolveValues(stableValues)
    return list.map((record, index) => ({ ...record, [stableField]: String(stableValues[index] || '').trim(), [displayField]: displays[index] }))
  }

  return { resolveValue, resolveValues, resolveRecord, resolveRecords }
}

module.exports = { createMediaUrlService }
