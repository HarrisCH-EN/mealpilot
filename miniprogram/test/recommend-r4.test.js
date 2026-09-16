const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..', 'pages', 'recommend')
const script = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
const template = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8')
const styles = fs.readFileSync(path.join(root, 'index.wxss'), 'utf8')
const preferenceState = require(path.join(root, 'preference-state'))

test('R4 generates a persisted run before showing candidate results', () => {
  assert.match(script, /request\('\/recommendations', 'POST', this\.buildRequest\(\)\)/)
  assert.match(script, /currentCandidate = candidates\[0\] \|\| normalizeCandidate\(data\)/)
  assert.match(script, /runId: Number\(data\.runId \|\| currentCandidate\.runId\)/)
})

test('R4 changes candidates through persisted rank lookup only', () => {
  assert.match(script, /request\(\`\/recommendations\/\$\{this\.data\.runId\}\/candidates\/\$\{this\.data\.rank \+ 1\}\`\)/)
  assert.match(script, /request\(\`\/recommendations\/\$\{this\.data\.runId\}\/candidates\/\$\{this\.data\.rank - 1\}\`\)/)
  assert.match(script, /async previousCandidate\(\)/)
  assert.match(script, /!this\.data\.nextCandidateAvailable/)
  assert.doesNotMatch(script, /Math\.random/)
})

test('R4 keeps difficulty stars on each persisted candidate item', () => {
  assert.match(script, /difficultyStars: difficultyStars\(item\.difficulty\)/)
  assert.match(template, /recommend-dish__difficulty/)
  assert.match(template, /item\.difficultyStars/)
  assert.doesNotMatch(template, /recommend-result__reason|recommend-dish__reason/)
})

test('R4 result navigation controls use the brand pink treatment and compact layout', () => {
  assert.match(template, /recommend-previous-cta[^>]*bindtap="previousCandidate"/)
  assert.match(styles, /\.recommend-result \.recommend-actions\s*\{[^}]*grid-template-columns/s)
  assert.match(styles, /\.recommend-result \.recommend-primary-cta\s*\{[^}]*background:\s*#ff385c/s)
  assert.match(styles, /\.recommend-result \.recommend-secondary-cta,[\s\S]*?border:\s*1rpx solid #ff385c/)
})

test('R4 apply sends only the selected candidate identifier', () => {
  assert.match(script, /request\(\`\/recommendations\/\$\{this\.data\.runId\}\/apply\`, 'POST', \{ candidateId: this\.data\.candidateId \}\)/)
  assert.doesNotMatch(script, /recipeIds\s*:/)
})

test('R4 keeps overtime as a visible normal candidate state', () => {
  assert.match(script, /withinTimeLimit: candidate\.withinTimeLimit !== false/)
  assert.match(template, /!currentCandidate\.withinTimeLimit/)
  assert.match(template, /currentCandidate\.timeWarning/)
  assert.match(styles, /\.recommend-candidate__warning\s*\{[^}]*color:\s*#d93025;/s)
})

test('R4 maps stale and infeasible responses to user-facing recovery actions', () => {
  assert.match(script, /status === 409/)
  assert.match(script, /这组菜单的信息已经发生变化，请重新生成一次。/)
  assert.match(script, /status === 422/)
  assert.match(script, /暂时凑不出这一桌，可以减少菜品数量或调整搭配。/)
  assert.match(template, /调整搭配/)
})

test('R4 does not offer another candidate after the persisted list ends', () => {
  assert.match(template, /已经是最后一组搭配/)
  assert.match(script, /nextCandidateAvailable: Boolean\(currentCandidate\.nextCandidateAvailable\)/)
})

test('R4 reset returns to setup without clearing the entered session', () => {
  assert.match(script, /backToSetup\(\)/)
  assert.match(script, /this\.setData\(\{ screen: 'setup', error: '', errorType: '' \}\)/)
  assert.match(template, /bindtap="backToSetup"/)
})

test('T4 uses one API-backed tag selector for session preferences', () => {
  assert.match(script, /request\('\/tags'\)/)
  assert.match(template, /wx:for="\{\{tagOptions\}\}"/)
  assert.match(template, /data-tag-id="\{\{item\.id\}\}"/)
  assert.match(script, /selectedTagIds/)
  assert.doesNotMatch(template, /data-group="tasteTags"|data-group="dietaryTags"/)
  assert.doesNotMatch(template, /优先当季食材|清淡|高蛋白|时令/)
  assert.doesNotMatch(script, /TAG_GROUPS|tasteTags|dietaryTags|seasonal/)
  assert.doesNotMatch(script, /familyPreferences|loadPreferenceSummary|goPreferences/)
})

test('T4 keeps the first tag request in a loading state until tags are ready', () => {
  assert.match(script, /tagReady:\s*false/)
  assert.match(script, /tagReady:\s*true/)
  assert.match(template, /wx:if="\{\{tagLoading \|\| !tagReady\}\}"/)
})

test('R4 uses a wheel time selector bound to maxPrepMinutes', () => {
  assert.match(template, /scroll-view[^>]*class="recommend-time-ruler__scroll"/)
  assert.match(template, /scroll-x/)
  assert.match(template, /bindscroll="handlePrepScroll"/)
  assert.match(template, /bindscrollend="finishPrepScroll"/)
  assert.match(template, /recommend-time-ruler__pointer/)
  assert.doesNotMatch(template, /recommend-choice-row/)
  assert.doesNotMatch(template, /bindtap="selectPrepTime"/)
  assert.match(script, /prepScrollLeft/)
  assert.match(script, /handlePrepScroll\(event\)/)
  assert.match(script, /finishPrepScroll\(\)/)
  assert.match(script, /vibrateShort/)
  assert.doesNotMatch(script, /selectPrepTime/)
})

test('R4 wheel values stay within the legal preparation range and keep the canonical payload', () => {
  const values = preferenceState.PREP_TIME_OPTIONS.map((option) => option.value)
  assert.equal(values[0], preferenceState.MIN_PREP_MINUTES)
  assert.equal(values.at(-1), preferenceState.MAX_PREP_MINUTES)
  assert.ok(values.every((value) => Number.isInteger(value)))
  assert.ok(values.every((value) => value % preferenceState.PREP_TIME_STEP === 0))

  const request = preferenceState.buildCanonicalRequest({
    menuDate: '2026-09-07',
    mealType: 'dinner',
    peopleCount: 3,
    maxPrepMinutes: 80,
    structure: { mainCount: 1, vegetableCount: 1, soupCount: 1, stapleCount: 1 },
    preferences: {}
  })

  assert.equal(request.maxPrepMinutes, 80)
  assert.equal('maxCookMinutes' in request, false)
  assert.equal('mode' in request, false)
})
