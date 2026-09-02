const BASE_URL = 'http://127.0.0.1:3000/api'
const app = getApp()
function request(path, method = 'GET', data = {}) {
  return new Promise((resolve, reject) => wx.request({ url: BASE_URL + path, method, data, header: app.globalData.token ? { Authorization: 'Bearer ' + app.globalData.token } : {}, success: (res) => { const body = res.data || {}; if (res.statusCode >= 200 && res.statusCode < 300 && body.ok !== false) resolve(body.data); else reject(new Error(body.message || '请求失败')) }, fail: reject }))
}
async function devLogin() { const data = await request('/auth/dev-login', 'POST', { openid: 'demo-owner', displayName: '演示用户' }); app.setSession(data); return data }
module.exports = { request, devLogin }
