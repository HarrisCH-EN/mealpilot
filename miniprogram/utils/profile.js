function normalizeDisplayName(value) {
  return String(value || '').trim()
}

function validateDisplayName(value) {
  const displayName = normalizeDisplayName(value)
  if (!displayName) return '请先填写昵称'
  if (displayName.length > 40) return '昵称不能超过40个字符'
  return ''
}

module.exports = { normalizeDisplayName, validateDisplayName }
