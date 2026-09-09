const crypto = require('node:crypto')

function seededHash(seed, key) {
  return crypto.createHash('sha256').update(`${String(seed)}|${String(key)}`).digest('hex')
}

function orderBySeed(items, seed, keySelector = (item) => item.id) {
  if (seed === undefined || seed === null || seed === '') return [...items]
  return items
    .map((item, index) => ({ item, index, key: String(keySelector(item)) }))
    .sort((left, right) => {
      const hashOrder = seededHash(seed, left.key).localeCompare(seededHash(seed, right.key))
      return hashOrder || left.key.localeCompare(right.key) || left.index - right.index
    })
    .map(({ item }) => item)
}

function orderPoolsBySeed(pools, seed) {
  return Object.fromEntries(Object.entries(pools).map(([slot, pool]) => [
    slot,
    orderBySeed(pool, seed, (recipe) => recipe.id)
  ]))
}

module.exports = { orderBySeed, orderPoolsBySeed, seededHash }
