const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const projectRoot = path.resolve(__dirname, '..', '..')
const miniprogramRoot = path.join(projectRoot, 'miniprogram')
const seed = fs.readFileSync(path.join(projectRoot, 'database', '02_seed.sql'), 'utf8')

const expected = new Map([
  ['番茄炒蛋', '/assets/recipes/tomato-scrambled-eggs.jpg'],
  ['蒜蓉西兰花', '/assets/recipes/garlic-broccoli.jpg'],
  ['冬瓜虾仁汤', '/assets/recipes/winter-melon-shrimp-soup.jpg'],
  ['香煎鸡胸肉', '/assets/recipes/pan-seared-chicken-breast.jpg'],
  ['清炒菠菜', '/assets/recipes/stir-fried-spinach.jpg'],
  ['家常豆腐汤', '/assets/recipes/homestyle-tofu-soup.jpg'],
  ['青椒肉丝', '/assets/recipes/green-pepper-pork.jpg'],
  ['土豆炖牛肉', '/assets/recipes/potato-beef-stew.jpg'],
  ['香菇滑鸡', '/assets/recipes/shiitake-chicken.jpg'],
  ['虾仁炒蛋', '/assets/recipes/shrimp-scrambled-eggs.jpg'],
  ['糖醋里脊', '/assets/recipes/sweet-and-sour-pork.jpg'],
  ['蒜苔炒肉', '/assets/recipes/garlic-chive-pork.jpg'],
  ['宫保鸡丁', '/assets/recipes/kung-pao-chicken.jpg'],
  ['清炒菜心', '/assets/recipes/stir-fried-choy-sum.jpg'],
  ['家常茄子', '/assets/recipes/homestyle-eggplant.jpg'],
  ['地三鲜', '/assets/recipes/di-san-xian.jpg'],
  ['清炒荷兰豆', '/assets/recipes/stir-fried-snow-peas.jpg'],
  ['海带豆腐汤', '/assets/recipes/seaweed-tofu-soup.jpg'],
  ['土豆焖饭', ''],
  ['玉米排骨汤', '/assets/recipes/corn-ribs-soup.jpg']
])

test('demo recipe seed is the source of truth for cover_url mappings', () => {
  assert.match(fs.readFileSync(path.join(projectRoot, 'database', '01_schema.sql'), 'utf8'), /cover_url\s+VARCHAR\(500\)\s+NOT NULL\s+DEFAULT\s+''/)
  for (const [title, coverUrl] of expected) {
    const row = new RegExp(`'${title}'.*?${coverUrl ? `'${coverUrl}'` : "''"}`, 's')
    assert.match(seed, row, `${title} must keep its seed cover_url mapping`)
  }
})

test('required bundled recipe images are readable JPEGs while the media directory may grow', () => {
  const assetDir = path.join(miniprogramRoot, 'assets', 'recipes')
  const mappedFiles = [...expected.values()].filter(Boolean).map((coverUrl) => path.join(miniprogramRoot, coverUrl))
  const actualFiles = new Set(fs.readdirSync(assetDir))
  const hashes = new Set()
  for (const file of mappedFiles) {
    assert.equal(actualFiles.has(path.basename(file)), true, `${file} must remain part of the media directory`)
    assert.ok(fs.existsSync(file), `${file} must exist`)
    const bytes = fs.readFileSync(file)
    assert.ok(bytes.length > 10000, `${file} should not be an empty placeholder`)
    assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], `${file} must be a JPEG`)
    assert.equal(bytes.length < 500 * 1024, true, `${file} should stay below 500 KB`)
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')
    assert.equal(hashes.has(hash), false, `${file} must not duplicate another recipe image`)
    hashes.add(hash)
  }
})

test('recipe API exposes stable coverFileId in list and detail queries', () => {
  const routes = fs.readFileSync(path.join(projectRoot, 'server', 'src', 'routes', 'recipes.js'), 'utf8')
  assert.equal((routes.match(/cover_url AS coverFileId/g) || []).length, 3)
})

test('local MiniProgram image paths follow the existing bundle-relative convention', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(miniprogramRoot, 'app.json'), 'utf8'))
  for (const tab of appConfig.tabBar.list) assert.match(tab.iconPath, /^assets\/tab\//)
  for (const coverUrl of expected.values()) if (coverUrl) assert.match(coverUrl, /^\/assets\/recipes\/[a-z0-9]+(?:-[a-z0-9]+)*\.jpg$/)
})
