function normalizeTag(tag = {}) {
  return {
    ...tag,
    id: Number(tag.id || 0),
    name: String(tag.name || ''),
    kind: tag.kind === 'custom' ? 'custom' : 'system'
  }
}

function flattenTagCatalog(catalog = {}) {
  return [...(catalog.systemTags || []), ...(catalog.customTags || [])]
    .map(normalizeTag)
    .filter((tag) => tag.id > 0 && tag.name)
}

function normalizeTagIds(values) {
  if (!Array.isArray(values)) return []
  const seen = new Set()
  return values.reduce((ids, value) => {
    const id = Number(value)
    if (Number.isInteger(id) && id > 0 && !seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
    return ids
  }, [])
}

function toggleTagId(values, value) {
  const ids = normalizeTagIds(values)
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) return ids
  return ids.includes(id) ? ids.filter((item) => item !== id) : ids.concat(id)
}

function decorateTagOptions(catalogTags, selectedTagIds, recipeTags = []) {
  const selected = new Set(normalizeTagIds(selectedTagIds))
  const byId = new Map((catalogTags || []).map((tag) => {
    const normalized = normalizeTag(tag)
    return [normalized.id, normalized]
  }))
  for (const tag of recipeTags || []) {
    const normalized = normalizeTag(tag)
    if (normalized.id > 0 && selected.has(normalized.id) && !byId.has(normalized.id)) byId.set(normalized.id, normalized)
  }
  return [...byId.values()].map((tag) => ({ ...tag, selected: selected.has(tag.id) }))
}

function displayTags(tags, limit) {
  const normalized = (Array.isArray(tags) ? tags : []).map(normalizeTag).filter((tag) => tag.id > 0 && tag.name)
  return Number.isInteger(limit) && limit >= 0 ? normalized.slice(0, limit) : normalized
}

module.exports = { decorateTagOptions, displayTags, flattenTagCatalog, normalizeTag, normalizeTagIds, toggleTagId }
