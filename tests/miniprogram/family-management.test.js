const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.join(__dirname, '..', '..', 'miniprogram')
const pageRoot = path.join(root, 'pages', 'family-management')

test('family management is a registered real page with family and member actions', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  const template = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
  const script = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')
  const styles = fs.readFileSync(path.join(pageRoot, 'index.wxss'), 'utf8')
  const config = JSON.parse(fs.readFileSync(path.join(pageRoot, 'index.json'), 'utf8'))

  assert.ok(appConfig.pages.includes('pages/family-management/index'))
  assert.equal(config.navigationStyle, 'custom')
  assert.match(template, /家庭信息/)
  assert.match(template, /家庭成员/)
  assert.match(template, /bindtap="renameFamily"/)
  assert.match(template, /assets\/icons\/recipes\/edit\.png/)
  assert.match(styles, /\.family-hero__edit\s*\{[^}]*flex:\s*0 0 64rpx;[^}]*max-width:\s*64rpx/s)
  assert.match(styles, /\.family-member__manage\s*\{[^}]*width:\s*82rpx;[^}]*flex:\s*0 0 82rpx;[^}]*max-width:\s*82rpx/s)
  assert.match(template, /bindtap="leaveFamily"/)
  assert.doesNotMatch(template, /family-state--empty/)
  assert.doesNotMatch(template, /bindtap="createFamily"/)
  assert.doesNotMatch(template, /bindtap="joinFamily"/)
  assert.match(template, /bindtap="copyInviteCode"/)
  assert.match(template, /bindtap="refreshInviteCode"/)
  assert.match(template, /刷新邀请码/)
  assert.doesNotMatch(template, /请联系管理员获取邀请码/)
  assert.match(template, /bindtap="manageMember"/)
  assert.match(script, /request\('\/families\/current'\)/)
  assert.match(script, /families\/current\/name/)
  assert.match(script, /renameFamily\(/)
  assert.match(script, /request\('\/families\/leave', 'POST'/)
  assert.match(script, /\/families\/current\/transfer-admin/)
  assert.match(script, /\/families\/current\/members\/\$\{memberId\}/)
  assert.doesNotMatch(script, /transfer-ownership/)
  assert.match(script, /request\('\/families\/current\/invite-code\/refresh', 'POST'/)
  assert.match(script, /refreshInviteCode\(/)
  assert.match(script, /loading: true[\s\S]*membership: null[\s\S]*members: \[\]/)
  assert.match(script, /管理员/)
  assert.match(script, /成员/)
  assert.match(styles, /\.family-invite__refresh\s*\{[^}]*border:[^}]*background:\s*transparent/s)
})

test('settings opens the family page and displays the family permission', () => {
  const settingsScript = fs.readFileSync(path.join(root, 'pages', 'settings', 'index.js'), 'utf8')
  const settingsTemplate = fs.readFileSync(path.join(root, 'pages', 'settings', 'index.wxml'), 'utf8')

  assert.match(settingsScript, /wx\.navigateTo\(\{ url: '\/pages\/family-management\/index' \}\)/)
  assert.match(settingsScript, /userRoleLabel/)
  assert.match(settingsScript, /canManageFamily/)
  assert.match(settingsTemplate, /\{\{userRoleLabel\}\}/)
  assert.doesNotMatch(settingsTemplate, /allowDevLogin \? '本地开发身份' : '微信登录用户'/)
  assert.doesNotMatch(settingsTemplate, /联系管理员获取邀请码/)
  assert.match(settingsTemplate, /class="settings-quick-card" bindtap="copyCode"/)
})

test('family management exposes administrator-only disband without a family-less creation screen', () => {
  const template = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
  const script = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')
  const styles = fs.readFileSync(path.join(pageRoot, 'index.wxss'), 'utf8')

  assert.match(template, /wx:if="\{\{isAdmin\}\}"[^>]*class="family-danger"/)
  assert.match(template, /bindtap="disbandFamily"/)
  assert.doesNotMatch(template, /recoverableFamilies/)
  assert.doesNotMatch(template, /bindtap="restoreFamily"/)
  assert.doesNotMatch(script, /request\('\/families\/recoverable'\)/)
  assert.match(script, /request\('\/families\/current', 'DELETE'/)
  assert.match(script, /最终确认/)
  assert.match(styles, /\.family-danger__button\s*\{[^}]*background:\s*transparent/s)
})

test('settings create-family opens the recovery-aware flow without navigating away', async () => {
  const settingsScript = fs.readFileSync(path.join(root, 'pages', 'settings', 'index.js'), 'utf8')
  const settingsTemplate = fs.readFileSync(path.join(root, 'pages', 'settings', 'index.wxml'), 'utf8')
  const requests = []
  const navigations = []
  let page

  assert.doesNotMatch(settingsScript, /\/pages\/family-management\/index\?action=create/)
  assert.match(settingsTemplate, /wx:if="\{\{showRecoverySheet\}\}"/)
  assert.match(settingsTemplate, /bindtap="restoreFamily"/)

  vm.runInNewContext(settingsScript, {
    Page(definition) { page = definition },
    require(requestPath) {
      if (requestPath === '../../utils/api') {
        return {
          request: async (url) => {
            requests.push(url)
            if (url === '/families/recoverable') {
              return [{ id: 9, name: '旧家庭', remainingDays: 29 }]
            }
            return {}
          },
          ensureAuthenticated: async () => ({ user: {}, membership: null }),
          resolveCoverUrl: (value) => value || '',
          requireAuthentication: () => true
        }
      }
      if (requestPath === '../../utils/auth-runtime') {
        return { store: { getState: () => ({ membership: null }), setSession() {} } }
      }
      return require(requestPath)
    },
    wx: {
      getWindowInfo: () => ({ statusBarHeight: 20, windowWidth: 375 }),
      getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375 }),
      getMenuButtonBoundingClientRect: () => ({ bottom: 56 }),
      showModal() {},
      showToast() {},
      navigateTo(options) { navigations.push(options) },
      getStorageInfoSync: () => ({ keys: [] })
    },
    Number,
    String,
    Math
  })

  const context = {
    ...page,
    data: { ...page.data },
    setData(patch) { Object.assign(this.data, patch) }
  }
  await page.createFamily.call(context)

  assert.ok(requests.includes('/families/recoverable'))
  assert.equal(navigations.length, 0)
  assert.equal(context.data.showRecoverySheet, true)
  assert.equal(context.data.recoverableFamilies[0].id, 9)
})

test('successful family disband returns directly to the settings tab', () => {
  const script = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')

  assert.match(
    script,
    /await request\('\/families\/current', 'DELETE'\)[\s\S]*wx\.switchTab\(\{ url: '\/pages\/settings\/index' \}\)/
  )
})

test('family management redirects family-less users to settings instead of rendering an empty screen', () => {
  const script = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')

  assert.match(
    script,
    /if \(!membership \|\| !membership\.role\) \{[\s\S]*wx\.switchTab\(\{ url: '\/pages\/settings\/index' \}\)[\s\S]*return/
  )
})

test('family management accepts the flattened current-family response shape', async () => {
  const script = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')
  let page
  const switchedTabs = []

  vm.runInNewContext(script, {
    Page(definition) { page = definition },
    require(requestPath) {
      if (requestPath === '../../utils/api') {
        return {
          request: async () => ({
            member_id: 7,
            family_id: 10,
            role: 'admin',
            family_name: '周末饭桌',
            invite_code: 'ABC123',
            members: []
          }),
          resolveCoverUrl: value => value || '',
          requireAuthentication: () => true
        }
      }
      if (requestPath === '../../utils/auth-runtime') {
        return { store: { setSession() {}, getState: () => ({}) } }
      }
      return require(requestPath)
    },
    wx: { switchTab(options) { switchedTabs.push(options) } },
    Number,
    String
  })

  const context = {
    ...page,
    data: { ...page.data },
    setData(patch) { Object.assign(this.data, patch) }
  }
  await page.loadFamily.call(context)

  assert.equal(context.data.membership.role, 'admin')
  assert.equal(context.data.isAdmin, true)
  assert.equal(context.data.inviteCode, 'ABC123')
  assert.equal(switchedTabs.length, 0)
})

test('settings recovery sheet presents a cloud restore icon and horizontal footer actions', () => {
  const template = fs.readFileSync(path.join(root, 'pages', 'settings', 'index.wxml'), 'utf8')

  assert.match(
    template,
    /<image class="settings-recovery__action-icon" src="\/assets\/icons\/settings\/cloud download\.png" mode="aspectFit" \/>/
  )
  assert.doesNotMatch(template, /class="settings-recovery__action">恢复<\/text>/)
  assert.match(
    template,
    /<view class="settings-recovery__actions">[\s\S]*settings-recovery__new[\s\S]*settings-recovery__cancel[\s\S]*<\/view>/
  )
  assert.match(template, /class="settings-recovery__item-shell"/)
  assert.match(
    template,
    /<view class="settings-recovery__item[^\"]*"[^>]*role="button"[^>]*bindtap="restoreFamily"/
  )
  assert.match(template, /class="settings-recovery__meta"/)
  assert.match(template, /class="settings-recovery__days-badge"/)
  assert.match(template, /class="settings-recovery__restore-orb"/)
  assert.doesNotMatch(template, /<button class="settings-recovery__item"/)
})

test('settings recovery sheet keeps compact centered footer actions', () => {
  const styles = fs.readFileSync(path.join(root, 'pages', 'settings', 'index.wxss'), 'utf8')

  assert.match(styles, /\.settings-recovery__list\s*\{[^}]*display:\s*block[^}]*width:\s*calc\(100% \+ 72rpx\)[^}]*box-sizing:\s*border-box[^}]*margin-left:\s*-36rpx/s)
  assert.match(styles, /\.settings-recovery__item-shell\s*\{[^}]*display:\s*block[^}]*width:\s*100%/s)
  assert.match(styles, /\.settings-recovery__item\s*\{[^}]*width:\s*100%[^}]*max-width:\s*none[^}]*box-sizing:\s*border-box[^}]*border-radius:\s*0/s)
  assert.match(styles, /\.settings-recovery__actions\s*\{[^}]*display:\s*flex[^}]*width:\s*100%/s)
  assert.match(styles, /\.settings-recovery__actions\s*\{[^}]*justify-content:\s*center/s)
  assert.match(styles, /\.settings-recovery__new,\s*\.settings-recovery__cancel\s*\{[^}]*width:\s*220rpx[^}]*flex:\s*0 0 220rpx[^}]*align-items:\s*center[^}]*justify-content:\s*center/s)
  assert.match(styles, /\.settings-recovery__meta\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center/s)
  assert.match(styles, /\.settings-recovery__days-badge\s*\{[^}]*border-radius:\s*999rpx[^}]*background:\s*var\(--settings-accent-soft\)/s)
  assert.match(styles, /\.settings-recovery__restore-orb\s*\{[^}]*align-items:\s*center[^}]*justify-content:\s*center[^}]*border-radius:\s*50%/s)
})
