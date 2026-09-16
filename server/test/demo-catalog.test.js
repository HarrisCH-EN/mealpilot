const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const expectedTitles = [
  '番茄炒蛋', '蒜蓉西兰花', '冬瓜虾仁汤', '香煎鸡胸肉', '清炒菠菜', '家常豆腐汤', '土豆焖饭',
  '清蒸鲈鱼', '青椒肉丝', '土豆炖牛肉', '香菇滑鸡', '虾仁炒蛋', '糖醋里脊', '红烧鸡翅',
  '芹菜炒牛肉', '蒜苔炒肉', '葱爆羊肉', '红烧鱼块', '宫保鸡丁', '清炒菜心', '蒜蓉空心菜',
  '香菇青菜', '手撕包菜', '家常茄子', '地三鲜', '醋溜白菜', '清炒荷兰豆', '凉拌黄瓜',
  '木耳炒山药', '香菇豆腐', '紫菜蛋花汤', '番茄牛腩汤', '玉米排骨汤', '海带豆腐汤',
  '鲫鱼豆腐汤', '丝瓜虾皮汤', '菌菇鸡汤', '莲藕排骨汤', '香菇鸡肉粥', '小米南瓜粥',
  '皮蛋瘦肉粥', '三鲜水饺', '猪肉白菜包子', '葱油饼', '蛋炒饭', '扬州炒饭', '南瓜发糕', '红豆小米粥'
]

test('seed SQL contains the complete demo catalog and core ingredient relations', () => {
  const seed = fs.readFileSync(path.join(__dirname, '../../database/02_seed.sql'), 'utf8')
  const recipeStart = seed.indexOf('INSERT INTO recipes')
  const recipeEnd = seed.indexOf('ON DUPLICATE KEY UPDATE', recipeStart)
  const recipeLines = seed.slice(recipeStart, recipeEnd).split(/\r?\n/).filter((line) => /^\(\d+,@family_id,@member_id,/.test(line))
  const recipes = recipeLines.map((line) => {
    const match = line.match(/^\((\d+),@family_id,@member_id,'([^']+)','([^']+)',.*?,\d+,\d+,\d+,'([^']*)'\),?$/)
    assert.ok(match, `无法解析 seed Recipe 行: ${line}`)
    return { id: Number(match[1]), title: match[2], category: match[3], coverUrl: match[4] }
  })

  assert.equal(recipes.length, 48)
  assert.deepEqual(recipes.map((recipe) => recipe.title), expectedTitles)
  assert.ok(recipes.every((recipe) => ['荤菜', '素菜', '汤', '主食'].includes(recipe.category)))
  assert.ok(recipes.every((recipe) => !recipe.coverUrl || /^\/assets\/recipes\/[a-z0-9]+(?:-[a-z0-9]+)*\.jpg$/.test(recipe.coverUrl)))

  const relationStart = seed.indexOf('INSERT INTO recipe_ingredients')
  const relationEnd = seed.indexOf(';', relationStart)
  const relations = [...seed.slice(relationStart, relationEnd).matchAll(/\((\d+),(\d+),[0-9.]+,'[^']*'\)/g)]
  const relationCounts = new Map()
  for (const relation of relations) relationCounts.set(Number(relation[1]), (relationCounts.get(Number(relation[1])) || 0) + 1)
  assert.equal(relationCounts.size, 48)
  assert.ok([...relationCounts.values()].every((count) => count >= 2))
})

test('seed SQL does not overwrite a customized demo user name', () => {
  const seed = fs.readFileSync(path.join(__dirname, '../../database/02_seed.sql'), 'utf8')
  const userSeed = seed.slice(0, seed.indexOf('SET @user_id'))
  assert.match(userSeed, /ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID\(id\)/i)
  assert.doesNotMatch(userSeed, /ON DUPLICATE KEY UPDATE display_name = '演示用户'/i)
})
