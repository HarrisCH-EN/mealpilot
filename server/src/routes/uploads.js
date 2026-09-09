const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const express = require('express')
const { HttpError } = require('../http')

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Map([
  ['image/jpeg', new Set(['.jpg', '.jpeg'])],
  ['image/png', new Set(['.png'])],
  ['image/webp', new Set(['.webp'])]
])

function router({ uploadRoot, maxBytes = DEFAULT_MAX_BYTES, auth, family }) {
  const result = express.Router()
  result.post('/uploads/recipe-cover', auth, family, asyncRoute(async (request, response) => {
    const file = await readMultipartFile(request, maxBytes)
    const extension = path.extname(file.filename).toLowerCase()
    const allowedExtensions = ALLOWED_TYPES.get(file.mime)
    if (!allowedExtensions || !allowedExtensions.has(extension) || !hasValidSignature(file.buffer, file.mime)) {
      throw new HttpError(400, '仅支持 JPG、PNG 或 WebP 图片')
    }
    if (file.buffer.length > maxBytes) throw new HttpError(413, '图片不能超过 5MB')

    const filename = `${crypto.randomUUID()}${extension}`
    const relativeDirectory = path.join('recipes')
    const directory = path.join(uploadRoot, relativeDirectory)
    await fs.mkdir(directory, { recursive: true })
    try {
      await fs.writeFile(path.join(directory, filename), file.buffer, { flag: 'wx' })
    } catch (_error) {
      throw new HttpError(500, '图片保存失败')
    }
    response.status(201).json({ ok: true, data: { coverUrl: `/uploads/recipes/${filename}` } })
  }))
  return result
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
    request.on('end', () => {
      if (!settled) resolve(Buffer.concat(chunks))
    })
    request.on('error', (error) => {
      if (!settled) {
        settled = true
        reject(error)
      }
    })
  })
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

function hasValidSignature(buffer, mime) {
  if (mime === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (mime === 'image/webp') return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  return false
}

module.exports = { router, DEFAULT_MAX_BYTES }
