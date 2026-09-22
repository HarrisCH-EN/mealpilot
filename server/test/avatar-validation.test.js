const test = require('node:test')
const assert = require('node:assert/strict')
const { validateImage } = require('../src/routes/uploads')

test('avatar validation detects JPEG from bytes even when filename and MIME are wrong', () => {
  assert.equal(validateImage({ filename: 'avatar.png', mime: 'image/png', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) }, 1024), '.jpg')
})

test('avatar validation detects PNG and WebP from bytes instead of trusting client metadata', () => {
  assert.equal(validateImage({ filename: 'avatar.jpg', mime: 'image/jpeg', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }, 1024), '.png')
  assert.equal(validateImage({ filename: 'avatar.jpg', mime: 'image/jpeg', buffer: Buffer.from('RIFF0000WEBP') }, 1024), '.webp')
})

test('avatar validation rejects a non-image payload with a JPG extension', () => {
  assert.throws(
    () => validateImage({ filename: 'avatar.jpg', mime: 'image/jpeg', buffer: Buffer.from('not an image') }, 1024),
    /仅支持 JPG、PNG 或 WebP 图片/
  )
})
