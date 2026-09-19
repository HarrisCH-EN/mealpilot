const PROFILE_PLACEHOLDERS = new Set(['', '微信用户'])

function isProfileComplete(user) {
  const displayName = String(user && user.display_name || '').trim()
  const avatarFileId = String(user && (user.avatarFileId !== undefined ? user.avatarFileId : user.avatar_url) || '').trim()
  return !PROFILE_PLACEHOLDERS.has(displayName) && Boolean(avatarFileId)
}

module.exports = { isProfileComplete }
