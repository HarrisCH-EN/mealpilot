const { MAX_RAW_MENU_CANDIDATES } = require('./constants')
const { expandMealStructure, validateMealStructure } = require('./menu-structure')

function generateRawMenuCandidates({ pools, structure, maxCandidates = MAX_RAW_MENU_CANDIDATES }) {
  const normalized = validateMealStructure(structure)
  const slots = expandMealStructure(normalized)
  const candidates = []
  const chosen = []
  const usedIds = new Set()
  const lastIndexBySlot = new Map()

  function visit(slotIndex) {
    if (candidates.length >= maxCandidates) return
    if (slotIndex === slots.length) {
      candidates.push([...chosen])
      return
    }
    const slot = slots[slotIndex]
    const pool = Array.isArray(pools[slot]) ? pools[slot] : []
    const start = lastIndexBySlot.has(slot) ? lastIndexBySlot.get(slot) + 1 : 0
    for (let index = start; index < pool.length; index += 1) {
      if (candidates.length >= maxCandidates) break
      const item = pool[index]
      if (usedIds.has(item.id)) continue
      usedIds.add(item.id)
      chosen.push(item)
      const previous = lastIndexBySlot.get(slot)
      lastIndexBySlot.set(slot, index)
      visit(slotIndex + 1)
      if (previous === undefined) lastIndexBySlot.delete(slot)
      else lastIndexBySlot.set(slot, previous)
      chosen.pop()
      usedIds.delete(item.id)
    }
  }

  visit(0)
  return { candidates, truncated: candidates.length >= maxCandidates }
}

module.exports = { generateRawMenuCandidates }
