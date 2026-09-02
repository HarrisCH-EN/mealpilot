class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function requireFields(body, fields) {
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || String(body[field]).trim() === '') {
      throw new HttpError(400, `缺少字段：${field}`)
    }
  }
}

module.exports = { HttpError, requireFields }

