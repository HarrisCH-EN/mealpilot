const crypto = require('node:crypto')
const express = require('express')
const { HttpError } = require('../http')

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024
function router({ cloudStorageService, mediaUrlService, storageFileIdPrefix = '', maxBytes = DEFAULT_MAX_BYTES, auth, family, database }) {
  const result = express.Router()

  result.post('/uploads/recipe-cover', auth, family, asyncRoute(async (request, response) => {
    requireStorage(cloudStorageService)
    const file = await readUploadFile(request, maxBytes)
    const extension = validateImage(file, maxBytes)
    const cloudPath = `families/${request.membership.family_id}/recipes/${crypto.randomUUID()}${extension}`
    const stored = await cloudStorageService.uploadBuffer({ cloudPath, buffer: file.buffer })
    try {
      const coverUrl = await cloudStorageService.getTemporaryUrl(stored.fileId)
      response.status(201).json({ ok: true, data: { coverFileId: stored.fileId, coverUrl } })
    } catch (error) {
      await bestEffortDelete(cloudStorageService, stored.fileId)
      throw error
    }
  }))

  result.post('/uploads/avatar', auth, asyncRoute(async (request, response) => {
    if (!database) throw new HttpError(500, '头像服务未配置')
    requireStorage(cloudStorageService)
    const [oldRows] = await database.execute('SELECT avatar_url FROM users WHERE id = ?', [request.user.id])
    if (!oldRows[0]) throw new HttpError(401, '登录已失效')
    const oldFileId = String(oldRows[0].avatar_url || '').trim()
    const file = await readUploadFile(request, maxBytes)
    const extension = validateImage(file, maxBytes)
    const cloudPath = `users/${request.user.id}/avatars/${crypto.randomUUID()}${extension}`
    const stored = await cloudStorageService.uploadBuffer({ cloudPath, buffer: file.buffer })
    let displayUrl
    try {
      displayUrl = await cloudStorageService.getTemporaryUrl(stored.fileId)
      await database.execute('UPDATE users SET avatar_url = ? WHERE id = ?', [stored.fileId, request.user.id])
    } catch (error) {
      await bestEffortDelete(cloudStorageService, stored.fileId)
      throw error
    }
    const [rows] = await database.execute('SELECT id, openid, display_name, avatar_url FROM users WHERE id = ?', [request.user.id])
    if (!rows[0]) throw new HttpError(401, '登录已失效')
    await deleteOldAvatar(cloudStorageService, oldFileId, storageFileIdPrefix, request.user.id)
    const user = { ...rows[0], avatarFileId: stored.fileId, avatar_url: displayUrl, avatarUrl: displayUrl }
    response.status(201).json({ ok: true, data: { user } })
  }))
  return result
}

function requireStorage(cloudStorageService) {
  if (!cloudStorageService || typeof cloudStorageService.uploadBuffer !== 'function') throw new HttpError(503, '图片存储服务未配置')
}

async function deleteOldAvatar(cloudStorageService, fileId, prefix, userId) {
  const normalizedPrefix = String(prefix || '').replace(/\/+$/, '')
  const expectedPrefix = `${normalizedPrefix}/users/${userId}/avatars/`
  if (!normalizedPrefix || !fileId.startsWith(expectedPrefix) || fileId.slice(expectedPrefix.length).includes('/')) return
  try {
    await cloudStorageService.deleteFile(fileId)
  } catch (error) {
    console.warn('[MealPilot Storage Warning]', { operation: 'delete-old-avatar', errorCode: error && error.code || 'CLOUDBASE_STORAGE_DELETE_FAILED' })
  }
}

async function bestEffortDelete(cloudStorageService, fileId) {
  try { await cloudStorageService.deleteFile(fileId) } catch (_error) {}
}

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)
}

async function readMultipartFile(request, maxBytes) {
  const contentType = String(request.headers['content-type'] || '')
  const match = contentType.match(/^multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^;]+))/i)
  if (!match) throw new HttpError(400, '上传格式不正确')
  const boundary = match[1] || match[2]
  const body = await readRequestBody(request, maxBytes + 64 * 1024)
  const delimiter = Buffer.from(`--${boundary}`)
  let cursor = body.indexOf(delimiter)
  while (cursor !== -1) {
    let partStart = cursor + delimiter.length
    if (body.subarray(partStart, partStart + 2).equals(Buffer.from('--'))) break
    if (body.subarray(partStart, partStart + 2).equals(Buffer.from('\r\n'))) partStart += 2
    const nextBoundary = body.indexOf(delimiter, partStart)
    if (nextBoundary === -1) break
    const part = body.subarray(partStart, Math.max(partStart, nextBoundary - 2))
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'))
    if (headerEnd === -1) break
    const headers = parsePartHeaders(part.subarray(0, headerEnd).toString('utf8'))
    const content = part.subarray(headerEnd + 4)
    if (headers.name === 'file' && headers.filename) return { filename: headers.filename, mime: headers.contentType, buffer: content }
    cursor = nextBoundary
  }
  throw new HttpError(400, '请选择要上传的图片')
}

async function readUploadFile(request, maxBytes) {
  const contentType = String(request.headers['content-type'] || '').toLowerCase()
  if (contentType.startsWith('application/octet-stream')) {
    return { filename: 'upload', mime: 'application/octet-stream', buffer: await readRequestBody(request, maxBytes) }
  }
  return readMultipartFile(request, maxBytes)
}

function readRequestBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    let settled = false
    request.on('data', (chunk) => {
      if (settled) return
      total += chunk.length
      if (total > maxBytes) {
        settled = true
        request.resume()
        reject(new HttpError(413, '上传文件过大'))
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => { if (!settled) resolve(Buffer.concat(chunks)) })
    request.on('error', (error) => { if (!settled) { settled = true; reject(error) } })
  })
}

function validateImage(file, maxBytes) {
  if (file.buffer.length > maxBytes) throw new HttpError(413, '图片不能超过 5MB')
  const detected = detectImageFormat(file.buffer)
  if (!detected) throw new HttpError(400, '仅支持 JPG、PNG 或 WebP 图片')
  return detected.extension
}

function parsePartHeaders(value) {
  const headers = {}
  for (const line of value.split('\r\n')) {
    const separator = line.indexOf(':')
    if (separator === -1) continue
    headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim()
  }
  const disposition = headers['content-disposition'] || ''
  const name = disposition.match(/(?:^|;)\s*name="([^"]*)"/i)
  const filename = disposition.match(/(?:^|;)\s*filename="([^"]*)"/i)
  return { name: name && name[1], filename: filename && filename[1], contentType: String(headers['content-type'] || '').toLowerCase() }
}

function detectImageFormat(buffer) {
  if (!Buffer.isBuffer(buffer)) return null
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff && buffer.includes(Buffer.from([0xff, 0xd9]))) {
    return { mime: 'image/jpeg', extension: '.jpg' }
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', extension: '.png' }
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { mime: 'image/webp', extension: '.webp' }
  }
  return null
}

module.exports = { router, DEFAULT_MAX_BYTES, validateImage, detectImageFormat, deleteOldAvatar }
