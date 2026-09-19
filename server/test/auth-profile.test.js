const test = require('node:test')
const assert = require('node:assert/strict')

const { isProfileComplete } = require('../src/services/auth-profile')

test('profile is complete only when display name and stable avatar are present', () => {
  assert.equal(isProfileComplete({ display_name: '小明', avatar_url: 'cloud://env/users/7/avatar.png' }), true)
  assert.equal(isProfileComplete({ display_name: '', avatar_url: 'cloud://env/users/7/avatar.png' }), false)
  assert.equal(isProfileComplete({ display_name: '微信用户', avatar_url: 'cloud://env/users/7/avatar.png' }), false)
  assert.equal(isProfileComplete({ display_name: '小明', avatar_url: '' }), false)
  assert.equal(isProfileComplete({ display_name: '小明', avatar_url: 'https://temporary.example/avatar.png' }), true)
})
