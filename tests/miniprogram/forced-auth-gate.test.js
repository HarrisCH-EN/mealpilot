const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..', '..', 'miniprogram')
const { createAuthStore } = require('../../miniprogram/utils/auth-store')
const { createRouteGuard, LOGIN_ROUTE, PROFILE_SETUP_ROUTE } = require('../../miniprogram/utils/route-guard')

const protectedPages = [
  'recommend', 'menu', 'recipes', 'settings', 'recipe-detail', 'recipe-form',
  'tag-management', 'restrictions', 'about', 'family-management', 'account-management'
]

test('the app starts on the login page without a launch-time relaunch', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8')
  const login = fs.readFileSync(path.join(root, 'pages', 'login', 'index.js'), 'utf8')

  assert.equal(appConfig.pages[0], 'pages/login/index')
  assert.match(app, /wx\.getStorageSync\(['"]token['"]\)/)
  assert.doesNotMatch(app, /wx\.reLaunch\(/)
  assert.match(login, /authService\.bootstrap/)
  assert.match(login, /routeGuard\.routeSession/)
  assert.match(login, /\/pages\/recommend\/index/)
  assert.match(login, /if \(this\._redirecting\) return/)
})

test('every business page applies the shared authentication gate before rendering', () => {
  for (const page of protectedPages) {
    const script = fs.readFileSync(path.join(root, 'pages', page, 'index.js'), 'utf8')
    assert.match(script, /requireAuthentication/, `${page} page must use the auth gate`)
  }
})

test('business pages no longer render an unauthenticated settings state', () => {
  const settingsTemplate = fs.readFileSync(path.join(root, 'pages', 'settings', 'index.wxml'), 'utf8')
  const settingsScript = fs.readFileSync(path.join(root, 'pages', 'settings', 'index.js'), 'utf8')

  assert.doesNotMatch(settingsTemplate, /还没有登录|请使用微信登录|bindtap="goLogin"|bindtap="retryLogin"|本地开发登录/)
  assert.doesNotMatch(settingsScript, /loggedOut|goLogin\(|retryLogin\(|devLogin/)
})

test('logout delegates clearing the session to the auth service and returns to login', () => {
  const accountScript = fs.readFileSync(path.join(root, 'pages', 'account-management', 'index.js'), 'utf8')

  assert.match(accountScript, /authService\.logout\(\)/)
  assert.match(accountScript, /wx\.reLaunch\(\{\s*url:\s*['"]\/pages\/login\/index['"]\s*\}\)/)
  assert.doesNotMatch(accountScript, /\/pages\/settings\/index\?loggedOut=1/)
})

function createGuardHarness({ token = '', authenticated = false } = {}) {
  const storage = { token }
  const store = createAuthStore({ storage })
  if (authenticated) store.setSession({ token, user: { id: 1 }, profileComplete: false })
  else store.hydrate()
  const redirects = []
  const guard = createRouteGuard({ store, wxApi: { reLaunch: (options) => redirects.push(options.url) } })
  return { store, guard, redirects }
}

test('the shared gate redirects unauthenticated direct page access and keeps token storage empty', () => {
  const { guard, store, redirects } = createGuardHarness()

  assert.equal(guard.requireAuthentication(), false)
  assert.equal(store.getState().token, '')
  assert.deepEqual(redirects, [LOGIN_ROUTE])
})

test('the shared gate allows a validated incomplete profile session', () => {
  const { guard, redirects } = createGuardHarness({ token: 'jwt-token', authenticated: true })

  assert.equal(guard.requireAuthentication(), true)
  assert.deepEqual(redirects, [])
  assert.equal(guard.routeSession({ status: 'authenticated', profileComplete: false }), PROFILE_SETUP_ROUTE)
})

test('a persisted token remains blocked until /auth/me validation completes', () => {
  const { guard, redirects } = createGuardHarness({ token: 'jwt-token' })

  assert.equal(guard.requireAuthentication(), false)
  assert.deepEqual(redirects, [LOGIN_ROUTE])
})

test('auth service source clears state after reauthentication remains unauthorized', () => {
  const authSource = fs.readFileSync(path.join(root, 'utils', 'auth-service.js'), 'utf8')
  const httpSource = fs.readFileSync(path.join(root, 'utils', 'http-client.js'), 'utf8')

  assert.match(authSource, /store\.clear\(\)/)
  assert.match(httpSource, /AUTH_SESSION_EXPIRED/)
  assert.match(httpSource, /retried/)
})
