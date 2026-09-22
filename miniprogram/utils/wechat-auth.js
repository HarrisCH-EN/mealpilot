function createWechatAuth({ wxApi = typeof wx === 'undefined' ? null : wx } = {}) {
  return {
    getLoginCode() {
      if (!wxApi || typeof wxApi.login !== 'function') return Promise.reject(Object.assign(new Error('微信登录 API 不可用'), { code: 'AUTH_WECHAT_UNAVAILABLE' }))
      return new Promise((resolve, reject) => wxApi.login({
        success(result) {
          const code = result && typeof result.code === 'string' ? result.code.trim() : ''
          if (!code) {
            reject(Object.assign(new Error('微信登录未返回有效凭证'), { code: 'AUTH_WECHAT_CODE_INVALID', errMsg: result && result.errMsg, errno: result && result.errno }))
            return
          }
          resolve(code)
        },
        fail(error) {
          reject(Object.assign(new Error('微信登录失败'), { code: 'AUTH_WECHAT_LOGIN_FAILED', errMsg: error && error.errMsg, errno: error && error.errno }))
        }
      }))
    }
  }
}

module.exports = { createWechatAuth }
