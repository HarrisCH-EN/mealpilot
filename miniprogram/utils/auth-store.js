const EMPTY_STATE = {
  status: 'unknown',
  token: '',
  user: null,
  profileComplete: false,
  membership: null,
  authError: null
}

function copyState(state) {
  return { ...state }
}

function createAuthStore({ storage = {}, onChange = () => {} } = {}) {
  let state = copyState(EMPTY_STATE)
  const listeners = new Set()

  function publish() {
    const snapshot = copyState(state)
    onChange(snapshot)
    listeners.forEach((listener) => listener(snapshot))
  }

  function setState(patch) {
    state = { ...state, ...patch }
    publish()
    return copyState(state)
  }

  return {
    getState() { return copyState(state) },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    hydrate() {
      const token = String(typeof storage.getStorageSync === 'function' ? storage.getStorageSync('token') || '' : '').trim()
      state = { ...EMPTY_STATE, token, status: token ? 'unknown' : 'unauthenticated' }
      publish()
      return copyState(state)
    },
    setAuthenticating() {
      return setState({ status: 'authenticating', authError: null })
    },
    setSession(session = {}) {
      if (Object.prototype.hasOwnProperty.call(session, 'token')) {
        state.token = String(session.token || '')
        if (typeof storage.setStorageSync === 'function') storage.setStorageSync('token', state.token)
      }
      state = {
        ...state,
        status: 'authenticated',
        user: Object.prototype.hasOwnProperty.call(session, 'user') ? session.user || null : state.user,
        profileComplete: Object.prototype.hasOwnProperty.call(session, 'profileComplete') ? session.profileComplete === true : state.profileComplete,
        membership: Object.prototype.hasOwnProperty.call(session, 'membership') ? session.membership || null : state.membership,
        authError: null
      }
      publish()
      return copyState(state)
    },
    setUnauthenticated(error = null) {
      return setState({ status: 'unauthenticated', token: '', user: null, profileComplete: false, membership: null, authError: error })
    },
    clear() {
      if (typeof storage.removeStorageSync === 'function') storage.removeStorageSync('token')
      return setState({ status: 'unauthenticated', token: '', user: null, profileComplete: false, membership: null, authError: null })
    },
    setAuthError(error) {
      return setState({ authError: error })
    }
  }
}

module.exports = { createAuthStore, EMPTY_STATE }
