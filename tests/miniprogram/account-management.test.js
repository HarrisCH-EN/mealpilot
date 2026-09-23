const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createAuthStore } = require('../../miniprogram/utils/auth-store')

const root = path.join(__dirname, '..', '..', 'miniprogram')

test('settings profile opens the account management page for a logged-in user', () => {
  const template = fs.readFileSync(path.join(root, 'pages', 'settings', 'index.wxml'), 'utf8')
  const script = fs.readFileSync(path.join(root, 'pages', 'settings', 'index.js'), 'utf8')

  assert.match(template, /class="settings-profile"[^>]*bindtap="handleUserTap"/)
  assert.match(script, /wx\.navigateTo\(\{\s*url:\s*['"]\/pages\/account-management\/index['"]\s*\}\)/)
})

test('account management exposes a confirmed logout action and returns to login', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  const pageRoot = path.join(root, 'pages', 'account-management')
  const template = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
  const script = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')

  assert.ok(appConfig.pages.includes('pages/account-management/index'))
  assert.match(template, /退出登录/)
  assert.match(template, /bindtap="logout"/)
  assert.match(script, /authService\.logout\(\)/)
  assert.match(script, /wx\.reLaunch\(\{\s*url:\s*['"]\/pages\/login\/index['"]\s*\}\)/)
})

test('account deletion is visually subtle, double-confirmed, and blocked for administrators', () => {
  const pageRoot = path.join(root, 'pages', 'account-management')
  const template = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
  const script = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')
  const styles = fs.readFileSync(path.join(pageRoot, 'index.wxss'), 'utf8')

  assert.match(template, /class="account-delete"[^>]*bindtap="deleteAccount"/)
  assert.match(script, /deleteAccount\(\)/)
  assert.match(script, /ACCOUNT_ADMIN_BLOCKED/)
  assert.match(script, /request\('\/auth\/account', 'DELETE'/)
  assert.match(template, /前往家庭管理/)
  assert.match(script, /最终确认/)
  assert.match(styles, /\.account-delete\s*\{[^}]*font-size:\s*2[0-6]rpx;[^}]*background:\s*transparent/s)
})

function createAccountPageHarness({ confirm, profileApi = {}, membership = null } = {}) {
  const script = fs.readFileSync(path.join(root, 'pages', 'account-management', 'index.js'), 'utf8')
  let page
  let clearSessionCalls = 0
  const relaunches = []
  const modals = []
  const actionSheets = []
  const chooseMediaCalls = []
  const toasts = []
  const storage = { token: 'jwt-token' }
  const store = createAuthStore({ storage })
  store.setSession({ token: storage.token, user: { openid: 'demo-owner', display_name: '演示用户' }, membership })
  const app = { globalData: {} }
  const authService = {
    logout: async () => {
      clearSessionCalls += 1
      store.clear()
    }
  }
  const wx = {
    getWindowInfo: () => ({ statusBarHeight: 20 }),
    getSystemInfoSync: () => ({ statusBarHeight: 20 }),
    getMenuButtonBoundingClientRect: () => ({ top: 24, height: 32 }),
    showModal(options) {
      if (options.title === '退出登录') options.success({ confirm })
      else modals.push(options)
    },
    showActionSheet(options) { actionSheets.push(options) },
    chooseMedia(options) { chooseMediaCalls.push(options) },
    showToast(options) { toasts.push(options) },
    reLaunch(options) { relaunches.push(options) },
    navigateTo(options) { relaunches.push(options) },
    navigateBack() {}
  }
  vm.runInNewContext(script, {
    Page: (definition) => { page = definition },
    require: (request) => {
      if (request === '../../config') return { allowDevLogin: true }
      if (request === '../../utils/api') return {
        request: profileApi.request || (async () => ({})),
        uploadAvatar: profileApi.uploadAvatar || (async () => ({})),
        resolveCoverUrl: (value) => value || '',
        requireAuthentication: () => true
      }
      if (request === '../../utils/auth-runtime') return { store, authService }
      if (request === '../../utils/profile') return {
        normalizeDisplayName: (value) => String(value || '').trim(),
        validateDisplayName: (value) => !String(value || '').trim() ? '请先填写昵称' : String(value).trim().length > 40 ? '昵称不能超过40个字符' : ''
      }
      return require(request)
    },
    wx,
    Math,
    Number,
    String
  })
  const context = {
    data: { ...page.data },
    setData(patch) { Object.assign(this.data, patch) },
    editAvatar: page.editAvatar,
    chooseAvatar: page.chooseAvatar,
    saveAvatar: page.saveAvatar,
    applyUser: page.applyUser,
    editDisplayName: page.editDisplayName,
    deleteAccount: page.deleteAccount,
    showAdminDeletionBlocked: page.showAdminDeletionBlocked,
    dismissAdminDeletionBlocked: page.dismissAdminDeletionBlocked,
    goToFamilyManagement: page.goToFamilyManagement,
    stopPropagation: page.stopPropagation
  }
  return { page, context, app, store, clearSessionCalls: () => clearSessionCalls, relaunches, modals, actionSheets, chooseMediaCalls, toasts }
}

test('confirmed logout clears the local session and relaunches the login page', async () => {
  const harness = createAccountPageHarness({ confirm: true })
  harness.page.onLoad.call(harness.context)
  harness.page.logout.call(harness.context)
  await Promise.resolve()

  assert.equal(harness.clearSessionCalls(), 1)
  assert.equal(harness.store.getState().token, '')
  assert.equal(harness.relaunches.length, 1)
  assert.equal(harness.relaunches[0].url, '/pages/login/index')
})

test('account deletion sends no request until both confirmations succeed', async () => {
  const requests = []
  const harness = createAccountPageHarness({
    confirm: false,
    profileApi: { request: async (...args) => { requests.push(args); return { deleted: true } } }
  })
  harness.page.onLoad.call(harness.context)
  harness.page.deleteAccount.call(harness.context)
  assert.equal(harness.modals.length, 1)
  harness.modals[0].success({ confirm: true })
  assert.equal(harness.modals.length, 2)
  await harness.modals[1].success({ confirm: true })

  assert.deepEqual(requests[0], ['/auth/account', 'DELETE'])
  assert.equal(harness.store.getState().token, '')
  assert.equal(harness.relaunches[0].url, '/pages/login/index')
})

test('administrator account deletion starts with a clear confirmation', () => {
  let requestCalls = 0
  const harness = createAccountPageHarness({
    confirm: false,
    membership: { role: 'admin', family_id: 10 },
    profileApi: { request: async () => { requestCalls += 1 } }
  })
  harness.page.onLoad.call(harness.context)
  harness.page.deleteAccount.call(harness.context)

  assert.equal(requestCalls, 0)
  assert.equal(harness.context.data.accountDeletionBlockedVisible, false)
  assert.equal(harness.modals.length, 1)
})

test('administrator account deletion keeps the transfer explanation for server rejection', () => {
  const template = fs.readFileSync(path.join(root, 'pages', 'account-management', 'index.wxml'), 'utf8')
  const harness = createAccountPageHarness({
    confirm: false,
    membership: { role: 'admin', family_id: 10 }
  })

  harness.page.onLoad.call(harness.context)
  harness.page.deleteAccount.call(harness.context)

  assert.equal(harness.context.data.accountDeletionBlockedVisible, false)
  assert.match(fs.readFileSync(path.join(root, 'pages', 'account-management', 'index.js'), 'utf8'), /ACCOUNT_ADMIN_BLOCKED/)
  assert.match(template, /wx:if="\{\{accountDeletionBlockedVisible\}\}"/)
  assert.match(template, /bindtap="goToFamilyManagement"/)
})

test('cancelling logout leaves the current session untouched', () => {
  const harness = createAccountPageHarness({ confirm: false })
  harness.page.logout.call(harness.context)

  assert.equal(harness.clearSessionCalls(), 0)
  assert.equal(harness.store.getState().token, 'jwt-token')
  assert.equal(harness.relaunches.length, 0)
})

test('editing the display name persists it and refreshes the account session', async () => {
  let receivedRequest = null
  const harness = createAccountPageHarness({
    confirm: false,
    profileApi: {
      request: async (pathName, method, data) => {
        receivedRequest = { pathName, method, data }
        return { user: { id: 7, openid: 'demo-owner', display_name: '新名字', avatar_url: '' } }
      }
    }
  })
  harness.page.onLoad.call(harness.context)
  harness.page.editDisplayName.call(harness.context)
  await harness.modals[0].success({ confirm: true, content: '新名字' })

  assert.equal(receivedRequest.pathName, '/auth/profile')
  assert.equal(receivedRequest.method, 'PATCH')
  assert.equal(receivedRequest.data.displayName, '新名字')
  assert.equal(harness.context.data.user.display_name, '新名字')
  assert.equal(harness.store.getState().user.display_name, '新名字')
  assert.equal(harness.context.data.profileUpdating, false)
})

test('choosing a camera avatar uploads it and refreshes the displayed avatar', async () => {
  let uploadedPath = ''
  const harness = createAccountPageHarness({
    confirm: false,
    profileApi: {
      uploadAvatar: async (filePath) => {
        uploadedPath = filePath
        return { user: { id: 7, openid: 'demo-owner', display_name: '演示用户', avatar_url: '/uploads/avatars/new.jpg' } }
      }
    }
  })
  harness.page.onLoad.call(harness.context)
  harness.page.editAvatar.call(harness.context)
  await harness.actionSheets[0].success({ tapIndex: 0 })
  const chooseMedia = harness.chooseMediaCalls[0]
  const uploadPromise = chooseMedia.success({ tempFiles: [{ tempFilePath: 'C:/tmp/avatar.jpg' }] })
  await uploadPromise

  assert.equal(Array.from(chooseMedia.sourceType).join(','), 'camera')
  assert.equal(Array.from(chooseMedia.mediaType).join(','), 'image')
  assert.equal(uploadedPath, 'C:/tmp/avatar.jpg')
  assert.equal(harness.context.data.avatarUrl, '/uploads/avatars/new.jpg')
  assert.equal(harness.context.data.profileUpdating, false)
})

test('account profile exposes a right-side edit button with avatar and name editing actions', () => {
  const pageRoot = path.join(root, 'pages', 'account-management')
  const template = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
  const script = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')
  const styles = fs.readFileSync(path.join(pageRoot, 'index.wxss'), 'utf8')
  const api = fs.readFileSync(path.join(root, 'utils', 'api.js'), 'utf8')

  assert.match(template, /class="account-profile__edit"[^>]*bindtap="editProfile"/)
  assert.match(template, /wx:if="\{\{user\.avatar_url\}\}"/)
  assert.match(template, /class="account-profile__edit-icon"[^>]*edit\.png/)
  assert.match(script, /editProfile\(\)/)
  assert.match(script, /wx\.showActionSheet/)
  assert.match(script, /wx\.chooseMedia|wx\.chooseImage/)
  assert.match(script, /request\(\s*['"]\/auth\/profile['"]\s*,\s*['"]PATCH['"]/) 
  assert.match(script, /uploadAvatar\(/)
  assert.match(api, /uploadAvatar:/)
  assert.match(styles, /\.account-profile__edit\s*\{[^}]*width:\s*64rpx;[^}]*flex:\s*0 0 64rpx;[^}]*margin:\s*0 0 0 auto;/s)
  assert.match(styles, /\.account-profile__edit\s*\{[^}]*background:\s*var\(--account-accent-soft\);/s)
})
