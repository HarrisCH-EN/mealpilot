const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'miniprogram', 'pages', 'restrictions', 'index.wxss'), 'utf8')

test('restriction action buttons are right-aligned and match the compact presentation', () => {
  assert.match(styles, /\.restrictions-create\s*\{[^}]*width:\s*auto !important;[^}]*margin:\s*0 0 0 auto;[^}]*background:\s*transparent;/s)
  assert.match(styles, /\.restriction-member-group__add\s*\{[^}]*width:\s*64rpx[^}]*margin:\s*0 0 0 auto;[^}]*border:\s*1rpx solid[^}]*;[^}]*border-radius:\s*50%/s)
  assert.match(styles, /\.restrictions-remove\s*\{[^}]*flex:\s*0 0 48rpx;[^}]*margin:\s*0 0 0 auto;[^}]*border:\s*0;[^}]*border-radius:\s*0 !important;[^}]*background:\s*transparent;/s)
  assert.match(styles, /\.restrictions-retry\s*\{[^}]*width:\s*82rpx;[^}]*margin:\s*28rpx 0 0 auto;[^}]*background:\s*transparent;/s)
})
