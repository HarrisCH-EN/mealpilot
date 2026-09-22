const LOGIN_ROUTE = '/pages/login/index'
const PROFILE_SETUP_ROUTE = '/pages/profile-setup/index'
const MAIN_ROUTE = '/pages/recommend/index'

function isAuthenticatedSession(session) {
  return Boolean(session && session.status === 'authenticated')
}

function nextRouteForSession(session, target = MAIN_ROUTE) {
  if (!isAuthenticatedSession(session)) return LOGIN_ROUTE
  return session.profileComplete === true ? target : PROFILE_SETUP_ROUTE
}

function createRouteGuard({ store, wxApi = typeof wx === 'undefined' ? null : wx } = {}) {
  let redirecting = false
  function redirect(url) {
    if (redirecting || !wxApi || typeof wxApi.reLaunch !== 'function') return
    redirecting = true
    wxApi.reLaunch({ url })
    setTimeout(() => { redirecting = false }, 0)
  }
  return {
    nextRouteForSession,
    requireAuthentication() {
      const session = store && store.getState ? store.getState() : null
      if (isAuthenticatedSession(session)) return true
      redirect(LOGIN_ROUTE)
      return false
    },
    routeSession(session, target = MAIN_ROUTE) {
      const route = nextRouteForSession(session, target)
      redirect(route)
      return route
    },
    resetRedirect() { redirecting = false }
  }
}

module.exports = { LOGIN_ROUTE, PROFILE_SETUP_ROUTE, MAIN_ROUTE, isAuthenticatedSession, nextRouteForSession, createRouteGuard }
