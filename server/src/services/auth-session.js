const { createToken } = require('../auth')
const { currentMembership } = require('../middleware/authenticate')
const { isProfileComplete } = require('./auth-profile')

async function presentUser(user, mediaUrlService) {
  if (!user) return user
  const avatarFileId = String(user.avatarFileId !== undefined ? user.avatarFileId : user.avatar_url || '').trim()
  if (!mediaUrlService) return { ...user, avatarFileId, avatar_url: avatarFileId, avatarUrl: avatarFileId }
  const [avatarUrl] = await mediaUrlService.resolveValues([avatarFileId])
  return { ...user, avatarFileId, avatar_url: avatarUrl, avatarUrl }
}

async function presentSession({ database, storedUser, jwtSecret, mediaUrlService, includeToken = false, isNewUser = false }) {
  const data = {
    user: await presentUser(storedUser, mediaUrlService),
    membership: await currentMembership(database, storedUser.id),
    profileComplete: isProfileComplete(storedUser)
  }
  if (!includeToken) return data
  return { token: createToken(storedUser, jwtSecret), isNewUser: Boolean(isNewUser), ...data }
}

module.exports = { presentUser, presentSession }
