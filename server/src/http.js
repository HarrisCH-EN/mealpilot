class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function requireFields(body, fields) {
  body = body || {}
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || String(body[field]).trim() === '') {
      throw new HttpError(400, `缺少字段：${field}`)
    }
  }
}

function isPositiveInteger(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0
  return typeof value === 'string' && /^\d+$/.test(value.trim()) && Number(value) > 0 && Number.isSafeInteger(Number(value))
}

function requirePositiveInteger(value, field) {
  if (!isPositiveInteger(value)) throw new HttpError(400, `${field}不合法`)
}

function isValidDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
}

function requireDateOnly(value, field = '日期') {
  if (!isValidDateOnly(value)) throw new HttpError(400, `${field}不合法`)
}

function requireEnum(value, allowed, field) {
  if (!allowed.includes(value)) throw new HttpError(400, `${field}不合法`)
}

function requireIntegerRange(value, min, max, field) {
  if (!isPositiveInteger(value) || Number(value) < min || Number(value) > max) throw new HttpError(400, `${field}不合法`)
}

module.exports = { HttpError, requireFields, isPositiveInteger, requirePositiveInteger, isValidDateOnly, requireDateOnly, requireEnum, requireIntegerRange }
