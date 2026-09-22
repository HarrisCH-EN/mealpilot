const DEFAULT_ENDPOINT = 'https://api.weixin.qq.com/sns/jscode2session'

class WechatAuthError extends Error {
  constructor(kind, cause = '') {
    super(kind)
    this.name = 'WechatAuthError'
    this.kind = kind
    this.cause = cause
  }
}

function createWechatAuthService({ appId, appSecret, fetchImpl = globalThis.fetch, endpoint = DEFAULT_ENDPOINT, timeoutMs = 5000 } = {}) {
  return {
    async exchangeCodeForSession(code) {
      if (!appId || !appSecret) throw new WechatAuthError('config')
      if (typeof fetchImpl !== 'function') throw new WechatAuthError('unavailable')

      const url = new URL(endpoint)
      url.searchParams.set('appid', appId)
      url.searchParams.set('secret', appSecret)
      url.searchParams.set('js_code', code)
      url.searchParams.set('grant_type', 'authorization_code')

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let response
      try {
        response = await fetchImpl(url, { method: 'GET', signal: controller.signal })
      } catch (error) {
        throw new WechatAuthError('unavailable', error.message)
      } finally {
        clearTimeout(timer)
      }

      if (!response || !response.ok) throw new WechatAuthError('unavailable')
      let payload
      try {
        payload = await response.json()
      } catch (error) {
        throw new WechatAuthError('unavailable', error.message)
      }

      if (payload && Number(payload.errcode || 0) !== 0) {
        const errorCode = Number(payload.errcode)
        if (errorCode === 40029) throw new WechatAuthError('invalid-code', String(errorCode))
        if (errorCode === 40013 || errorCode === 40125) throw new WechatAuthError('config', String(errorCode))
        throw new WechatAuthError('unavailable', String(errorCode))
      }
      if (!payload || typeof payload.openid !== 'string' || !payload.openid.trim()) throw new WechatAuthError('invalid-code')

      return {
        openid: payload.openid.trim(),
        unionid: typeof payload.unionid === 'string' ? payload.unionid : undefined
      }
    }
  }
}

module.exports = { createWechatAuthService, WechatAuthError }
