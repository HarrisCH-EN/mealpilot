function overlapCount(left, right) {
  const rightIds = new Set(right.recipeIds || right.map((item) => item.id))
  return (left.recipeIds || left.map((item) => item.id)).filter((id) => rightIds.has(id)).length
}

function tierComparator(left, right) {
  if (left.withinTimeLimit !== right.withinTimeLimit) return left.withinTimeLimit ? -1 : 1
  if (!left.withinTimeLimit && left.timeOverageMinutes !== right.timeOverageMinutes) return left.timeOverageMinutes - right.timeOverageMinutes
  if (right.totalScore !== left.totalScore) return right.totalScore - left.totalScore
  return (left.recipeIds || []).join(',').localeCompare((right.recipeIds || []).join(','))
}

function rankCandidates(candidates) {
  return [...candidates].sort(tierComparator)
}

function selectQualityWindow(candidates, { scoreDelta = 2, topK = 20 } = {}) {
  const ordered = rankCandidates(candidates)
  const tierOne = ordered.filter((candidate) => candidate.withinTimeLimit)
  const tierTwo = ordered.filter((candidate) => !candidate.withinTimeLimit)
  if (tierOne.length < 3) {
    const tierTwoBestScore = tierTwo.length ? tierTwo[0].totalScore : 0
    const tierTwoThreshold = tierTwoBestScore - scoreDelta
    const remaining = Math.max(0, topK - tierOne.length)
    const tierTwoWindow = tierTwo.filter((candidate) => candidate.totalScore >= tierTwoThreshold).slice(0, remaining)
    return [...tierOne.slice(0, topK), ...tierTwoWindow]
  }
  const bestScore = tierOne[0].totalScore
  const threshold = bestScore - scoreDelta
  const tierOneWindow = tierOne.filter((candidate) => candidate.totalScore >= threshold).slice(0, topK)
  const remaining = Math.max(0, topK - tierOneWindow.length)
  const tierTwoBestScore = tierTwo.length ? tierTwo[0].totalScore : 0
  const tierTwoThreshold = tierTwoBestScore - scoreDelta
  const tierTwoWindow = tierTwo.filter((candidate) => candidate.totalScore >= tierTwoThreshold).slice(0, remaining)
  return [...tierOneWindow, ...tierTwoWindow]
}

function selectDiverseCandidates(candidates, { maxCandidates = 3, maxOverlap = 1, presorted = false } = {}) {
  const orderedCandidates = presorted ? [...candidates] : rankCandidates(candidates)
  const tierOne = orderedCandidates.filter((candidate) => candidate.withinTimeLimit)
  const tierTwo = orderedCandidates.filter((candidate) => !candidate.withinTimeLimit)
  const selected = []
  let relaxationLevel = 0

  function fill(pool, thresholds) {
    for (const threshold of thresholds) {
      for (const candidate of pool) {
        if (selected.includes(candidate)) continue
        if (selected.length >= maxCandidates) return
        if (selected.every((existing) => overlapCount(existing, candidate) <= threshold)) selected.push(candidate)
      }
      if (selected.length >= maxCandidates) return
      if (threshold > maxOverlap) relaxationLevel = Math.max(relaxationLevel, threshold === Infinity ? 3 : threshold)
    }
  }

  fill(tierOne, [maxOverlap, 2, Infinity])
  fill(tierTwo, [maxOverlap, 2, Infinity])
  return {
    candidates: selected,
    relaxationLevel,
    diversityRelaxed: relaxationLevel > 0
  }
}

module.exports = { overlapCount, rankCandidates, selectDiverseCandidates, selectQualityWindow }
