const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..', '..', 'miniprogram')

function readPage(pageName) {
  const pageRoot = path.join(root, 'pages', pageName)
  return {
    template: fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8'),
    script: fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8'),
    styles: fs.readFileSync(path.join(pageRoot, 'index.wxss'), 'utf8')
  }
}

test('settings shares the persisted user and member avatars with an initial fallback', () => {
  const { template, script, styles } = readPage('settings')
  assert.match(template, /wx:if="\{\{user\.avatar_url\}\}"[^>]*class="settings-profile__avatar-image"[^>]*src="\{\{userAvatarUrl\}\}"/)
  assert.match(template, /wx:if="\{\{item\.avatarUrl\}\}"[^>]*class="settings-member__avatar-image"[^>]*src="\{\{item\.avatarUrl\}\}"/)
  assert.match(script, /resolveCoverUrl/)
  assert.match(script, /avatarUrl:\s*resolveCoverUrl\(member\.avatarUrl\)/)
  assert.match(styles, /\.settings-profile__avatar-image\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s)
  assert.match(styles, /\.settings-member__avatar-image\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s)
})

test('family management shares each member avatar with an initial fallback', () => {
  const { template, script, styles } = readPage('family-management')
  assert.match(template, /wx:if="\{\{item\.avatarUrl\}\}"[^>]*class="family-member__avatar-image"[^>]*src="\{\{item\.avatarUrl\}\}"/)
  assert.match(script, /resolveCoverUrl/)
  assert.match(script, /avatarUrl:\s*resolveCoverUrl\(member\.avatarUrl\)/)
  assert.match(styles, /\.family-member__avatar-image\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s)
})

test('restrictions shares each member avatar with an initial fallback', () => {
  const { template, script, styles } = readPage('restrictions')
  assert.match(template, /wx:if="\{\{item\.avatarUrl\}\}"[^>]*class="restrictions-member-avatar-image"[^>]*src="\{\{item\.avatarUrl\}\}"/)
  assert.match(script, /resolveCoverUrl/)
  assert.match(script, /avatarUrl:\s*member\.avatarUrl/)
  assert.match(styles, /\.restrictions-member-avatar-image\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s)
})

test('member pages prefer the global username and family rename updates global membership data', () => {
  const settings = readPage('settings')
  const family = readPage('family-management')
  const restrictions = readPage('restrictions')
  assert.match(settings.template, /\{\{item\.displayName \|\| item\.nickname\}\}/)
  assert.match(family.template, /\{\{item\.displayName \|\| item\.nickname\}\}/)
  assert.doesNotMatch(settings.template, /\{\{item\.nickname \|\| item\.displayName\}\}/)
  assert.doesNotMatch(family.template, /\{\{item\.nickname \|\| item\.displayName\}\}/)
  assert.match(restrictions.script, /name:\s*member\.displayName \|\| member\.nickname/)
  assert.match(family.script, /store\.setSession\(\{\s*membership\s*\}\)/)
})
