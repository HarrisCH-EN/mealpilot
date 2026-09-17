// Extracted from database/02_seed.sql recipe rows 1-48 and its recipe_ingredients/recipe_tags mappings.
const starterRecipes = [
  {
    title: '番茄炒蛋', category: '荤菜', description: '酸甜家常，鸡蛋嫩滑，适合全家。', steps: '鸡蛋炒熟盛出；番茄炒软出汁；倒回鸡蛋快速合炒。', cookMinutes: 12, difficulty: 1, servings: 2, coverUrl: '/assets/recipes/tomato-scrambled-eggs.jpg',
    ingredients: [{ ingredientId: 2, amountGrams: 120, note: '蛋液' }, { ingredientId: 3, amountGrams: 180, note: '去皮切块' }], systemTagCodes: ['sweet', 'sour']
  },
  {
    title: '蒜蓉西兰花', category: '素菜', description: '蒜香清爽的快手时蔬。', steps: '西兰花焯水；蒜末爆香；加入西兰花大火翻炒入味。', cookMinutes: 10, difficulty: 1, servings: 2, coverUrl: '/assets/recipes/garlic-broccoli.jpg',
    ingredients: [{ ingredientId: 4, amountGrams: 250, note: '切小朵' }, { ingredientId: 13, amountGrams: 12, note: '蒜末' }], systemTagCodes: []
  },
  {
    title: '冬瓜虾仁汤', category: '汤', description: '清淡鲜美，汤体清亮。', steps: '冬瓜煮至半透明；加入虾仁；调味后煮至虾仁变色。', cookMinutes: 20, difficulty: 2, servings: 3, coverUrl: '/assets/recipes/winter-melon-shrimp-soup.jpg',
    ingredients: [{ ingredientId: 6, amountGrams: 300, note: '切薄片' }, { ingredientId: 9, amountGrams: 150, note: '去虾线' }], systemTagCodes: ['shrimp']
  },
  {
    title: '香煎鸡胸肉', category: '荤菜', description: '高蛋白快手菜，外香里嫩。', steps: '鸡胸肉拍松腌制；平底锅两面煎至金黄；静置后切片。', cookMinutes: 18, difficulty: 2, servings: 2, coverUrl: '/assets/recipes/pan-seared-chicken-breast.jpg',
    ingredients: [{ ingredientId: 1, amountGrams: 300, note: '去皮鸡胸' }, { ingredientId: 14, amountGrams: 8, note: '腌制用' }], systemTagCodes: []
  },
  {
    title: '清炒菠菜', category: '素菜', description: '简单清爽的绿叶菜。', steps: '菠菜洗净沥水；蒜末爆香；大火快速翻炒至断生。', cookMinutes: 8, difficulty: 1, servings: 2, coverUrl: '/assets/recipes/stir-fried-spinach.jpg',
    ingredients: [{ ingredientId: 10, amountGrams: 300, note: '洗净沥水' }, { ingredientId: 13, amountGrams: 10, note: '蒜末' }], systemTagCodes: []
  },
  {
    title: '家常豆腐汤', category: '汤', description: '温和顺口的家常汤品。', steps: '豆腐切块；加入蔬菜煮开；小火煮透后调味。', cookMinutes: 22, difficulty: 1, servings: 3, coverUrl: '/assets/recipes/homestyle-tofu-soup.jpg',
    ingredients: [{ ingredientId: 7, amountGrams: 250, note: '嫩豆腐' }, { ingredientId: 5, amountGrams: 80, note: '切片' }], systemTagCodes: []
  },
  {
    title: '土豆焖饭', category: '主食', description: '一锅完成，土豆软糯，米饭饱满。', steps: '大米淘洗；土豆煸香；与米饭一起焖至熟透。', cookMinutes: 35, difficulty: 2, servings: 3, coverUrl: '',
    ingredients: [{ ingredientId: 11, amountGrams: 250, note: '切丁' }, { ingredientId: 12, amountGrams: 250, note: '淘洗' }], systemTagCodes: []
  },
  {
    title: '清蒸鲈鱼', category: '荤菜', description: '鲜嫩清淡的家庭蒸鱼。', steps: '鲈鱼处理干净；铺姜葱蒸熟；出锅后淋少量热油。', cookMinutes: 25, difficulty: 2, servings: 3, coverUrl: '',
    ingredients: [{ ingredientId: 8, amountGrams: 450, note: '整条处理' }, { ingredientId: 14, amountGrams: 10, note: '姜片' }, { ingredientId: 15, amountGrams: 15, note: '葱段' }], systemTagCodes: ['fish', 'steam']
  },
  {
    title: '青椒肉丝', category: '荤菜', description: '咸香下饭的家常小炒。', steps: '里脊切丝；青椒切丝；肉丝滑熟后与青椒合炒。', cookMinutes: 15, difficulty: 2, servings: 2, coverUrl: '/assets/recipes/green-pepper-pork.jpg',
    ingredients: [{ ingredientId: 17, amountGrams: 180, note: '切丝' }, { ingredientId: 16, amountGrams: 150, note: '切丝' }], systemTagCodes: []
  },
  {
    title: '土豆炖牛肉', category: '荤菜', description: '牛肉软烂，土豆绵密。', steps: '牛肉焯水；与土豆一同炖煮；收至汤汁浓郁。', cookMinutes: 60, difficulty: 3, servings: 4, coverUrl: '/assets/recipes/potato-beef-stew.jpg',
    ingredients: [{ ingredientId: 18, amountGrams: 350, note: '切块' }, { ingredientId: 11, amountGrams: 300, note: '切块' }], systemTagCodes: []
  },
  {
    title: '香菇滑鸡', category: '荤菜', description: '鸡肉嫩滑，香菇鲜香。', steps: '鸡腿肉腌制；香菇切片；一起蒸熟或焖熟至入味。', cookMinutes: 30, difficulty: 2, servings: 3, coverUrl: '/assets/recipes/shiitake-chicken.jpg',
    ingredients: [{ ingredientId: 20, amountGrams: 300, note: '去骨切块' }, { ingredientId: 19, amountGrams: 100, note: '切片' }], systemTagCodes: []
  },
  {
    title: '虾仁炒蛋', category: '荤菜', description: '鲜嫩清淡的快手菜。', steps: '虾仁腌制；鸡蛋炒至半凝固；加入虾仁翻炒至熟。', cookMinutes: 12, difficulty: 1, servings: 2, coverUrl: '/assets/recipes/shrimp-scrambled-eggs.jpg',
    ingredients: [{ ingredientId: 9, amountGrams: 160, note: '去虾线' }, { ingredientId: 2, amountGrams: 150, note: '蛋液' }], systemTagCodes: ['shrimp']
  },
  {
    title: '糖醋里脊', category: '荤菜', description: '酸甜适口的家庭版里脊。', steps: '里脊挂糊煎熟；调糖醋汁；回锅翻匀裹汁。', cookMinutes: 35, difficulty: 3, servings: 3, coverUrl: '/assets/recipes/sweet-and-sour-pork.jpg',
    ingredients: [{ ingredientId: 17, amountGrams: 300, note: '切条' }, { ingredientId: 3, amountGrams: 80, note: '调汁用' }], systemTagCodes: ['sweet', 'sour']
  },
  {
    title: '红烧鸡翅', category: '荤菜', description: '色泽红亮，肉质嫩香。', steps: '鸡翅煎至上色；加入调味汁；小火焖至收汁。', cookMinutes: 40, difficulty: 2, servings: 4, coverUrl: '',
    ingredients: [{ ingredientId: 21, amountGrams: 400, note: '洗净划刀' }, { ingredientId: 14, amountGrams: 10, note: '姜片' }], systemTagCodes: []
  },
  {
    title: '芹菜炒牛肉', category: '荤菜', description: '芹菜爽脆，牛肉鲜嫩。', steps: '牛肉切片滑熟；芹菜快炒；合炒至断生。', cookMinutes: 18, difficulty: 2, servings: 2, coverUrl: '',
    ingredients: [{ ingredientId: 18, amountGrams: 180, note: '切片' }, { ingredientId: 22, amountGrams: 180, note: '切段' }], systemTagCodes: []
  },
  {
    title: '蒜苔炒肉', category: '荤菜', description: '蒜苔爽脆，肉片咸香。', steps: '肉片滑熟；蒜苔煸炒；合炒至香味融合。', cookMinutes: 18, difficulty: 2, servings: 2, coverUrl: '/assets/recipes/garlic-chive-pork.jpg',
    ingredients: [{ ingredientId: 17, amountGrams: 180, note: '切片' }, { ingredientId: 23, amountGrams: 180, note: '切段' }], systemTagCodes: []
  },
  {
    title: '葱爆羊肉', category: '荤菜', description: '葱香浓郁的快手羊肉。', steps: '羊肉片大火滑炒；加入大量葱段；快速翻匀出锅。', cookMinutes: 15, difficulty: 2, servings: 2, coverUrl: '',
    ingredients: [{ ingredientId: 24, amountGrams: 220, note: '切片' }, { ingredientId: 15, amountGrams: 180, note: '葱段' }], systemTagCodes: []
  },
  {
    title: '红烧鱼块', category: '荤菜', description: '鱼肉入味，适合家庭晚餐。', steps: '鱼块煎香；加入调味汁；小火焖煮至汤汁浓稠。', cookMinutes: 35, difficulty: 2, servings: 3, coverUrl: '',
    ingredients: [{ ingredientId: 25, amountGrams: 400, note: '切块' }, { ingredientId: 14, amountGrams: 10, note: '姜片' }], systemTagCodes: ['fish']
  },
  {
    title: '宫保鸡丁', category: '荤菜', description: '鸡肉嫩、花生香，酸甜微辣。', steps: '鸡腿肉切丁滑熟；加入调味汁和花生；快速翻匀。', cookMinutes: 25, difficulty: 2, servings: 3, coverUrl: '/assets/recipes/kung-pao-chicken.jpg',
    ingredients: [{ ingredientId: 20, amountGrams: 250, note: '切丁' }, { ingredientId: 26, amountGrams: 60, note: '熟花生米' }], systemTagCodes: ['spicy', 'sweet']
  },
  {
    title: '清炒菜心', category: '素菜', description: '脆嫩清甜的时蔬。', steps: '菜心洗净；蒜末爆香；大火翻炒至翠绿断生。', cookMinutes: 8, difficulty: 1, servings: 2, coverUrl: '/assets/recipes/stir-fried-choy-sum.jpg',
    ingredients: [{ ingredientId: 27, amountGrams: 250, note: '洗净' }, { ingredientId: 13, amountGrams: 10, note: '蒜末' }], systemTagCodes: ['sweet']
  },
  {
    title: '蒜蓉空心菜', category: '素菜', description: '蒜香鲜明，口感爽脆。', steps: '空心菜沥干；蒜末爆香；大火快速翻炒。', cookMinutes: 8, difficulty: 1, servings: 2, coverUrl: '',
    ingredients: [{ ingredientId: 28, amountGrams: 300, note: '洗净沥水' }, { ingredientId: 13, amountGrams: 12, note: '蒜末' }], systemTagCodes: []
  },
  {
    title: '香菇青菜', category: '素菜', description: '清淡鲜香，简单易做。', steps: '香菇煸香；加入小白菜；翻炒至软嫩入味。', cookMinutes: 12, difficulty: 1, servings: 2, coverUrl: '',
    ingredients: [{ ingredientId: 19, amountGrams: 100, note: '切片' }, { ingredientId: 29, amountGrams: 250, note: '洗净' }], systemTagCodes: []
  },
  {
    title: '手撕包菜', category: '素菜', description: '爽脆微甜的家常包菜。', steps: '包菜手撕；大火煸炒；调味后保持脆嫩。', cookMinutes: 12, difficulty: 1, servings: 2, coverUrl: '',
    ingredients: [{ ingredientId: 30, amountGrams: 350, note: '手撕' }, { ingredientId: 13, amountGrams: 10, note: '蒜末' }], systemTagCodes: ['sweet']
  },
  {
    title: '家常茄子', category: '素菜', description: '茄子软嫩，酱香下饭。', steps: '茄子切段；煸炒至软；加入调味汁焖至入味。', cookMinutes: 20, difficulty: 2, servings: 2, coverUrl: '/assets/recipes/homestyle-eggplant.jpg',
    ingredients: [{ ingredientId: 31, amountGrams: 350, note: '切段' }, { ingredientId: 13, amountGrams: 10, note: '蒜末' }], systemTagCodes: []
  },
  {
    title: '地三鲜', category: '素菜', description: '土豆、茄子和青椒的家常组合。', steps: '土豆和茄子煎软；加入青椒；翻炒收汁。', cookMinutes: 28, difficulty: 2, servings: 3, coverUrl: '/assets/recipes/di-san-xian.jpg',
    ingredients: [{ ingredientId: 11, amountGrams: 180, note: '切块' }, { ingredientId: 31, amountGrams: 220, note: '切块' }, { ingredientId: 16, amountGrams: 100, note: '切块' }], systemTagCodes: []
  },
  {
    title: '醋溜白菜', category: '素菜', description: '酸香爽口，适合配饭。', steps: '白菜切片；大火炒至断生；沿锅边烹醋翻匀。', cookMinutes: 10, difficulty: 1, servings: 2, coverUrl: '',
    ingredients: [{ ingredientId: 51, amountGrams: 350, note: '切片' }, { ingredientId: 13, amountGrams: 10, note: '蒜末' }], systemTagCodes: ['sour']
  },
  {
    title: '清炒荷兰豆', category: '素菜', description: '清脆鲜甜的快手蔬菜。', steps: '荷兰豆去筋；蒜末爆香；大火翻炒至翠绿。', cookMinutes: 8, difficulty: 1, servings: 2, coverUrl: '/assets/recipes/stir-fried-snow-peas.jpg',
    ingredients: [{ ingredientId: 32, amountGrams: 250, note: '去筋' }, { ingredientId: 13, amountGrams: 10, note: '蒜末' }], systemTagCodes: ['sweet']
  },
  {
    title: '凉拌黄瓜', category: '素菜', description: '清爽开胃，制作简单。', steps: '黄瓜拍碎切段；加入蒜末；拌匀后冷藏片刻。', cookMinutes: 10, difficulty: 1, servings: 2, coverUrl: '',
    ingredients: [{ ingredientId: 33, amountGrams: 300, note: '拍碎切段' }, { ingredientId: 13, amountGrams: 12, note: '蒜末' }], systemTagCodes: ['sour']
  },
  {
    title: '木耳炒山药', category: '素菜', description: '山药爽滑，木耳脆嫩。', steps: '木耳泡发；山药切片焯水；快速合炒。', cookMinutes: 15, difficulty: 2, servings: 2, coverUrl: '',
    ingredients: [{ ingredientId: 34, amountGrams: 80, note: '泡发' }, { ingredientId: 35, amountGrams: 220, note: '切片' }], systemTagCodes: []
  },
  {
    title: '香菇豆腐', category: '素菜', description: '豆腐嫩滑，香菇鲜香。', steps: '豆腐切块；香菇煸香；加入豆腐小火焖入味。', cookMinutes: 18, difficulty: 1, servings: 3, coverUrl: '',
    ingredients: [{ ingredientId: 19, amountGrams: 100, note: '切片' }, { ingredientId: 7, amountGrams: 300, note: '切块' }], systemTagCodes: []
  },
  {
    title: '紫菜蛋花汤', category: '汤', description: '清淡鲜美的快手汤。', steps: '紫菜煮开；蛋液沿锅边淋入；关火后调味。', cookMinutes: 10, difficulty: 1, servings: 3, coverUrl: '',
    ingredients: [{ ingredientId: 36, amountGrams: 12, note: '泡发' }, { ingredientId: 2, amountGrams: 80, note: '蛋液' }], systemTagCodes: []
  },
  {
    title: '番茄牛腩汤', category: '汤', description: '番茄酸香，牛腩软烂。', steps: '牛腩焯水；与番茄炖煮；小火煮至软烂。', cookMinutes: 90, difficulty: 3, servings: 4, coverUrl: '',
    ingredients: [{ ingredientId: 18, amountGrams: 350, note: '切块' }, { ingredientId: 3, amountGrams: 250, note: '切块' }], systemTagCodes: ['sour']
  },
  {
    title: '玉米排骨汤', category: '汤', description: '清甜鲜美的家庭汤品。', steps: '排骨焯水；与玉米一同炖煮；煮至汤色清亮。', cookMinutes: 75, difficulty: 2, servings: 4, coverUrl: '/assets/recipes/corn-ribs-soup.jpg',
    ingredients: [{ ingredientId: 38, amountGrams: 350, note: '切段' }, { ingredientId: 37, amountGrams: 250, note: '切段' }], systemTagCodes: ['sweet']
  },
  {
    title: '海带豆腐汤', category: '汤', description: '清爽顺口，适合日常餐桌。', steps: '海带泡发；与豆腐煮开；小火煮透后调味。', cookMinutes: 25, difficulty: 1, servings: 3, coverUrl: '/assets/recipes/seaweed-tofu-soup.jpg',
    ingredients: [{ ingredientId: 39, amountGrams: 120, note: '泡发切段' }, { ingredientId: 7, amountGrams: 250, note: '切块' }], systemTagCodes: []
  },
  {
    title: '鲫鱼豆腐汤', category: '汤', description: '鱼汤鲜白，豆腐嫩滑。', steps: '鲫鱼煎香；加水煮出奶白汤；放入豆腐煮透。', cookMinutes: 35, difficulty: 2, servings: 3, coverUrl: '',
    ingredients: [{ ingredientId: 40, amountGrams: 350, note: '处理干净' }, { ingredientId: 7, amountGrams: 250, note: '切块' }], systemTagCodes: ['fish']
  },
  {
    title: '丝瓜虾皮汤', category: '汤', description: '丝瓜清甜，虾皮提鲜。', steps: '丝瓜切块；煮软后加入虾皮；调味出锅。', cookMinutes: 15, difficulty: 1, servings: 3, coverUrl: '',
    ingredients: [{ ingredientId: 41, amountGrams: 250, note: '切块' }, { ingredientId: 42, amountGrams: 20, note: '提鲜' }], systemTagCodes: ['sweet', 'shrimp']
  },
  {
    title: '菌菇鸡汤', category: '汤', description: '菌菇鲜香，鸡汤温润。', steps: '鸡腿肉焯水；与菌菇炖煮；小火煮至汤鲜。', cookMinutes: 60, difficulty: 2, servings: 4, coverUrl: '',
    ingredients: [{ ingredientId: 20, amountGrams: 300, note: '去骨切块' }, { ingredientId: 43, amountGrams: 180, note: '混合菌菇' }], systemTagCodes: []
  },
  {
    title: '莲藕排骨汤', category: '汤', description: '莲藕粉糯，汤味醇厚。', steps: '排骨焯水；与莲藕炖煮；煮至排骨软烂。', cookMinutes: 75, difficulty: 2, servings: 4, coverUrl: '',
    ingredients: [{ ingredientId: 38, amountGrams: 350, note: '切段' }, { ingredientId: 44, amountGrams: 300, note: '切块' }], systemTagCodes: []
  },
  {
    title: '香菇鸡肉粥', category: '主食', description: '米粥绵软，鸡肉和香菇鲜香。', steps: '大米煮至开花；加入鸡肉和香菇；煮至浓稠。', cookMinutes: 45, difficulty: 2, servings: 3, coverUrl: '',
    ingredients: [{ ingredientId: 12, amountGrams: 220, note: '淘洗' }, { ingredientId: 20, amountGrams: 150, note: '切丁' }, { ingredientId: 19, amountGrams: 80, note: '切丁' }], systemTagCodes: []
  },
  {
    title: '小米南瓜粥', category: '主食', description: '南瓜香甜，粥体顺滑。', steps: '小米淘洗；与南瓜同煮；煮至软烂浓稠。', cookMinutes: 35, difficulty: 1, servings: 3, coverUrl: '',
    ingredients: [{ ingredientId: 45, amountGrams: 120, note: '淘洗' }, { ingredientId: 46, amountGrams: 220, note: '切块' }], systemTagCodes: ['sweet']
  },
  {
    title: '皮蛋瘦肉粥', category: '主食', description: '咸香顺滑的家常粥。', steps: '大米煮粥底；加入瘦肉和皮蛋；煮熟调味。', cookMinutes: 45, difficulty: 2, servings: 3, coverUrl: '',
    ingredients: [{ ingredientId: 12, amountGrams: 220, note: '淘洗' }, { ingredientId: 47, amountGrams: 70, note: '切丁' }, { ingredientId: 48, amountGrams: 120, note: '切末' }], systemTagCodes: []
  },
  {
    title: '三鲜水饺', category: '主食', description: '鲜香多汁的家庭水饺。', steps: '饺子皮包入三鲜馅；水开下锅；煮熟捞出。', cookMinutes: 40, difficulty: 2, servings: 4, coverUrl: '',
    ingredients: [{ ingredientId: 49, amountGrams: 300, note: '饺子皮' }, { ingredientId: 9, amountGrams: 100, note: '虾仁' }, { ingredientId: 2, amountGrams: 100, note: '蛋液' }], systemTagCodes: ['shrimp']
  },
  {
    title: '猪肉白菜包子', category: '主食', description: '松软鲜香，适合家庭早餐。', steps: '面粉发酵；包入猪肉白菜馅；蒸熟即可。', cookMinutes: 90, difficulty: 3, servings: 5, coverUrl: '',
    ingredients: [{ ingredientId: 52, amountGrams: 350, note: '面粉' }, { ingredientId: 50, amountGrams: 250, note: '猪肉馅' }, { ingredientId: 51, amountGrams: 200, note: '白菜末' }], systemTagCodes: ['steam']
  },
  {
    title: '葱油饼', category: '主食', description: '外酥内软，葱香浓郁。', steps: '面团擀开抹油撒葱；卷起再擀；平底锅煎熟。', cookMinutes: 30, difficulty: 2, servings: 3, coverUrl: '',
    ingredients: [{ ingredientId: 52, amountGrams: 250, note: '面粉' }, { ingredientId: 15, amountGrams: 60, note: '葱花' }], systemTagCodes: []
  },
  {
    title: '蛋炒饭', category: '主食', description: '粒粒分明的家常炒饭。', steps: '米饭打散；鸡蛋炒熟；加入米饭大火翻炒。', cookMinutes: 15, difficulty: 1, servings: 2, coverUrl: '',
    ingredients: [{ ingredientId: 12, amountGrams: 300, note: '隔夜米饭' }, { ingredientId: 2, amountGrams: 120, note: '蛋液' }], systemTagCodes: []
  },
  {
    title: '扬州炒饭', category: '主食', description: '米饭松散，配料丰富。', steps: '鸡蛋炒香；加入米饭和虾仁；大火翻炒均匀。', cookMinutes: 20, difficulty: 2, servings: 3, coverUrl: '',
    ingredients: [{ ingredientId: 12, amountGrams: 300, note: '隔夜米饭' }, { ingredientId: 9, amountGrams: 80, note: '虾仁' }, { ingredientId: 2, amountGrams: 100, note: '蛋液' }], systemTagCodes: ['shrimp']
  },
  {
    title: '南瓜发糕', category: '主食', description: '松软香甜的家庭点心。', steps: '南瓜蒸熟压泥；与面粉发酵；蒸熟切块。', cookMinutes: 70, difficulty: 3, servings: 5, coverUrl: '',
    ingredients: [{ ingredientId: 52, amountGrams: 300, note: '面粉' }, { ingredientId: 46, amountGrams: 220, note: '南瓜泥' }], systemTagCodes: ['sweet', 'steam']
  },
  {
    title: '红豆小米粥', category: '主食', description: '红豆绵软，小米温润。', steps: '红豆提前浸泡；与小米同煮；煮至软烂。', cookMinutes: 50, difficulty: 1, servings: 3, coverUrl: '',
    ingredients: [{ ingredientId: 53, amountGrams: 100, note: '提前浸泡' }, { ingredientId: 45, amountGrams: 100, note: '淘洗' }], systemTagCodes: ['sweet']
  }
]

module.exports = Object.freeze(starterRecipes.map((recipe) => Object.freeze({
  ...recipe,
  ingredients: Object.freeze(recipe.ingredients.map((ingredient) => Object.freeze({ ...ingredient }))),
  systemTagCodes: Object.freeze([...recipe.systemTagCodes])
})))


