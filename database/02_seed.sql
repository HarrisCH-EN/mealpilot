USE mealpilot;

INSERT INTO users (openid, display_name) VALUES ('demo-owner', '演示用户')
ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id);
SET @user_id = (SELECT id FROM users WHERE openid = 'demo-owner');
INSERT INTO families (name, invite_code, owner_user_id) VALUES ('示例家庭', 'MEAL26', @user_id)
ON DUPLICATE KEY UPDATE name = VALUES(name);
SET @family_id = (SELECT id FROM families WHERE invite_code = 'MEAL26');
INSERT INTO family_members (family_id, user_id, role, nickname) VALUES (@family_id, @user_id, 'owner', '家人')
ON DUPLICATE KEY UPDATE nickname = '家人';
SET @member_id = (SELECT id FROM family_members WHERE family_id = @family_id AND user_id = @user_id LIMIT 1);

INSERT INTO ingredients (name, calories_per_100g, protein_per_100g, fat_per_100g, carbohydrate_per_100g) VALUES
('鸡胸肉',133,24.6,1.9,0),('鸡蛋',144,13.3,8.8,2.8),('番茄',18,0.9,0.2,3.9),
('西兰花',34,2.8,0.4,6.6),('胡萝卜',41,0.9,0.2,9.6),('冬瓜',12,0.4,0.2,2.6),
('豆腐',81,8.1,3.7,4.2),('鲈鱼',105,18.6,3.4,0),('虾仁',48,10.4,0.7,0),
('菠菜',23,2.9,0.4,3.6),('土豆',77,2,0.1,17),('大米',346,7.4,0.8,77.9),
('大蒜',149,6.4,0.5,33.1),('姜',80,1.8,0.8,17.8),('小葱',30,1.8,0.2,6.5),
('青椒',22,1,0.2,5.4),('猪里脊',143,20.2,6.2,0),('牛肉',125,20.2,4.2,0),
('香菇',34,2.2,0.3,5.5),('鸡腿肉',181,18.6,12.4,0),('鸡翅',194,17.5,13.8,0),
('芹菜',14,0.7,0.1,3),('蒜苔',66,2.1,0.4,15.4),('羊肉',203,19,14.1,0),
('草鱼',113,16.6,5.2,0),('花生米',574,24.8,44.3,21.7),('菜心',20,1.8,0.3,3.8),
('空心菜',20,2.2,0.3,3.6),('小白菜',15,1.5,0.3,2.5),('包菜',24,1.5,0.2,4.6),
('茄子',23,1.1,0.2,4.9),('荷兰豆',27,2.5,0.3,4.9),('黄瓜',16,0.8,0.2,2.9),
('木耳',21,1.5,0.2,6.6),('山药',57,1.9,0.2,12.4),('紫菜',250,26.7,1.1,44.3),
('玉米',112,4,1.2,22.8),('排骨',264,18.3,20.4,0),('海带',13,1.2,0.1,2.1),
('鲫鱼',108,17.1,4.2,0),('丝瓜',20,1,0.2,4.2),('虾皮',153,30.7,2.2,0),
('菌菇',28,2.7,0.4,4.2),('莲藕',74,2.6,0.1,17.2),('小米',361,9,3.1,75.1),
('南瓜',26,0.7,0.1,6.5),('皮蛋',171,14.2,10.7,2.7),('瘦肉',143,20.2,6.2,0),
('饺子皮',250,7.5,1.5,50),('猪肉馅',395,14.6,36,0),('白菜',17,1.5,0.2,3.2),
('面粉',361,11.2,1.5,74.6),('红豆',329,19.9,0.5,63.4)
ON DUPLICATE KEY UPDATE calories_per_100g = VALUES(calories_per_100g), protein_per_100g = VALUES(protein_per_100g), fat_per_100g = VALUES(fat_per_100g), carbohydrate_per_100g = VALUES(carbohydrate_per_100g);

INSERT INTO ingredient_seasons (ingredient_id, month) VALUES
(3,5),(3,6),(3,7),(3,8),(3,9),
(4,10),(4,11),(4,12),(4,1),(4,2),(4,3),
(6,6),(6,7),(6,8),(6,9),
(10,10),(10,11),(10,12),(10,1),(10,2),(10,3),
(27,10),(27,11),(27,12),(27,1),(27,2),(27,3),
(28,5),(28,6),(28,7),(28,8),(28,9),
(29,10),(29,11),(29,12),(29,1),(29,2),
(30,10),(30,11),(30,12),(30,1),(30,2),
(32,2),(32,3),(32,4),
(33,5),(33,6),(33,7),(33,8),
(39,5),(39,6),(39,7),(39,8),
(41,5),(41,6),(41,7),(41,8),
(46,8),(46,9),(46,10)
ON DUPLICATE KEY UPDATE month = VALUES(month);

INSERT INTO recipes (id, family_id, created_by_member_id, title, category, description, steps, cook_minutes, difficulty, servings, cover_url) VALUES
(1,@family_id,@member_id,'番茄炒蛋','荤菜','酸甜家常，鸡蛋嫩滑，适合全家。','鸡蛋炒熟盛出；番茄炒软出汁；倒回鸡蛋快速合炒。',12,1,2,'/assets/recipes/tomato-scrambled-eggs.jpg'),
(2,@family_id,@member_id,'蒜蓉西兰花','素菜','蒜香清爽的快手时蔬。','西兰花焯水；蒜末爆香；加入西兰花大火翻炒入味。',10,1,2,'/assets/recipes/garlic-broccoli.jpg'),
(3,@family_id,@member_id,'冬瓜虾仁汤','汤','清淡鲜美，汤体清亮。','冬瓜煮至半透明；加入虾仁；调味后煮至虾仁变色。',20,2,3,'/assets/recipes/winter-melon-shrimp-soup.jpg'),
(4,@family_id,@member_id,'香煎鸡胸肉','荤菜','高蛋白快手菜，外香里嫩。','鸡胸肉拍松腌制；平底锅两面煎至金黄；静置后切片。',18,2,2,'/assets/recipes/pan-seared-chicken-breast.jpg'),
(5,@family_id,@member_id,'清炒菠菜','素菜','简单清爽的绿叶菜。','菠菜洗净沥水；蒜末爆香；大火快速翻炒至断生。',8,1,2,'/assets/recipes/stir-fried-spinach.jpg'),
(6,@family_id,@member_id,'家常豆腐汤','汤','温和顺口的家常汤品。','豆腐切块；加入蔬菜煮开；小火煮透后调味。',22,1,3,'/assets/recipes/homestyle-tofu-soup.jpg'),
(7,@family_id,@member_id,'土豆焖饭','主食','一锅完成，土豆软糯，米饭饱满。','大米淘洗；土豆煸香；与米饭一起焖至熟透。',35,2,3,''),
(8,@family_id,@member_id,'清蒸鲈鱼','荤菜','鲜嫩清淡的家庭蒸鱼。','鲈鱼处理干净；铺姜葱蒸熟；出锅后淋少量热油。',25,2,3,''),
(9,@family_id,@member_id,'青椒肉丝','荤菜','咸香下饭的家常小炒。','里脊切丝；青椒切丝；肉丝滑熟后与青椒合炒。',15,2,2,'/assets/recipes/green-pepper-pork.jpg'),
(10,@family_id,@member_id,'土豆炖牛肉','荤菜','牛肉软烂，土豆绵密。','牛肉焯水；与土豆一同炖煮；收至汤汁浓郁。',60,3,4,'/assets/recipes/potato-beef-stew.jpg'),
(11,@family_id,@member_id,'香菇滑鸡','荤菜','鸡肉嫩滑，香菇鲜香。','鸡腿肉腌制；香菇切片；一起蒸熟或焖熟至入味。',30,2,3,'/assets/recipes/shiitake-chicken.jpg'),
(12,@family_id,@member_id,'虾仁炒蛋','荤菜','鲜嫩清淡的快手菜。','虾仁腌制；鸡蛋炒至半凝固；加入虾仁翻炒至熟。',12,1,2,'/assets/recipes/shrimp-scrambled-eggs.jpg'),
(13,@family_id,@member_id,'糖醋里脊','荤菜','酸甜适口的家庭版里脊。','里脊挂糊煎熟；调糖醋汁；回锅翻匀裹汁。',35,3,3,'/assets/recipes/sweet-and-sour-pork.jpg'),
(14,@family_id,@member_id,'红烧鸡翅','荤菜','色泽红亮，肉质嫩香。','鸡翅煎至上色；加入调味汁；小火焖至收汁。',40,2,4,''),
(15,@family_id,@member_id,'芹菜炒牛肉','荤菜','芹菜爽脆，牛肉鲜嫩。','牛肉切片滑熟；芹菜快炒；合炒至断生。',18,2,2,''),
(16,@family_id,@member_id,'蒜苔炒肉','荤菜','蒜苔爽脆，肉片咸香。','肉片滑熟；蒜苔煸炒；合炒至香味融合。',18,2,2,'/assets/recipes/garlic-chive-pork.jpg'),
(17,@family_id,@member_id,'葱爆羊肉','荤菜','葱香浓郁的快手羊肉。','羊肉片大火滑炒；加入大量葱段；快速翻匀出锅。',15,2,2,''),
(18,@family_id,@member_id,'红烧鱼块','荤菜','鱼肉入味，适合家庭晚餐。','鱼块煎香；加入调味汁；小火焖煮至汤汁浓稠。',35,2,3,''),
(19,@family_id,@member_id,'宫保鸡丁','荤菜','鸡肉嫩、花生香，酸甜微辣。','鸡腿肉切丁滑熟；加入调味汁和花生；快速翻匀。',25,2,3,'/assets/recipes/kung-pao-chicken.jpg'),
(20,@family_id,@member_id,'清炒菜心','素菜','脆嫩清甜的时蔬。','菜心洗净；蒜末爆香；大火翻炒至翠绿断生。',8,1,2,'/assets/recipes/stir-fried-choy-sum.jpg'),
(21,@family_id,@member_id,'蒜蓉空心菜','素菜','蒜香鲜明，口感爽脆。','空心菜沥干；蒜末爆香；大火快速翻炒。',8,1,2,''),
(22,@family_id,@member_id,'香菇青菜','素菜','清淡鲜香，简单易做。','香菇煸香；加入小白菜；翻炒至软嫩入味。',12,1,2,''),
(23,@family_id,@member_id,'手撕包菜','素菜','爽脆微甜的家常包菜。','包菜手撕；大火煸炒；调味后保持脆嫩。',12,1,2,''),
(24,@family_id,@member_id,'家常茄子','素菜','茄子软嫩，酱香下饭。','茄子切段；煸炒至软；加入调味汁焖至入味。',20,2,2,'/assets/recipes/homestyle-eggplant.jpg'),
(25,@family_id,@member_id,'地三鲜','素菜','土豆、茄子和青椒的家常组合。','土豆和茄子煎软；加入青椒；翻炒收汁。',28,2,3,'/assets/recipes/di-san-xian.jpg'),
(26,@family_id,@member_id,'醋溜白菜','素菜','酸香爽口，适合配饭。','白菜切片；大火炒至断生；沿锅边烹醋翻匀。',10,1,2,''),
(27,@family_id,@member_id,'清炒荷兰豆','素菜','清脆鲜甜的快手蔬菜。','荷兰豆去筋；蒜末爆香；大火翻炒至翠绿。',8,1,2,'/assets/recipes/stir-fried-snow-peas.jpg'),
(28,@family_id,@member_id,'凉拌黄瓜','素菜','清爽开胃，制作简单。','黄瓜拍碎切段；加入蒜末；拌匀后冷藏片刻。',10,1,2,''),
(29,@family_id,@member_id,'木耳炒山药','素菜','山药爽滑，木耳脆嫩。','木耳泡发；山药切片焯水；快速合炒。',15,2,2,''),
(30,@family_id,@member_id,'香菇豆腐','素菜','豆腐嫩滑，香菇鲜香。','豆腐切块；香菇煸香；加入豆腐小火焖入味。',18,1,3,''),
(31,@family_id,@member_id,'紫菜蛋花汤','汤','清淡鲜美的快手汤。','紫菜煮开；蛋液沿锅边淋入；关火后调味。',10,1,3,''),
(32,@family_id,@member_id,'番茄牛腩汤','汤','番茄酸香，牛腩软烂。','牛腩焯水；与番茄炖煮；小火煮至软烂。',90,3,4,''),
(33,@family_id,@member_id,'玉米排骨汤','汤','清甜鲜美的家庭汤品。','排骨焯水；与玉米一同炖煮；煮至汤色清亮。',75,2,4,'/assets/recipes/corn-ribs-soup.jpg'),
(34,@family_id,@member_id,'海带豆腐汤','汤','清爽顺口，适合日常餐桌。','海带泡发；与豆腐煮开；小火煮透后调味。',25,1,3,'/assets/recipes/seaweed-tofu-soup.jpg'),
(35,@family_id,@member_id,'鲫鱼豆腐汤','汤','鱼汤鲜白，豆腐嫩滑。','鲫鱼煎香；加水煮出奶白汤；放入豆腐煮透。',35,2,3,''),
(36,@family_id,@member_id,'丝瓜虾皮汤','汤','丝瓜清甜，虾皮提鲜。','丝瓜切块；煮软后加入虾皮；调味出锅。',15,1,3,''),
(37,@family_id,@member_id,'菌菇鸡汤','汤','菌菇鲜香，鸡汤温润。','鸡腿肉焯水；与菌菇炖煮；小火煮至汤鲜。',60,2,4,''),
(38,@family_id,@member_id,'莲藕排骨汤','汤','莲藕粉糯，汤味醇厚。','排骨焯水；与莲藕炖煮；煮至排骨软烂。',75,2,4,''),
(39,@family_id,@member_id,'香菇鸡肉粥','主食','米粥绵软，鸡肉和香菇鲜香。','大米煮至开花；加入鸡肉和香菇；煮至浓稠。',45,2,3,''),
(40,@family_id,@member_id,'小米南瓜粥','主食','南瓜香甜，粥体顺滑。','小米淘洗；与南瓜同煮；煮至软烂浓稠。',35,1,3,''),
(41,@family_id,@member_id,'皮蛋瘦肉粥','主食','咸香顺滑的家常粥。','大米煮粥底；加入瘦肉和皮蛋；煮熟调味。',45,2,3,''),
(42,@family_id,@member_id,'三鲜水饺','主食','鲜香多汁的家庭水饺。','饺子皮包入三鲜馅；水开下锅；煮熟捞出。',40,2,4,''),
(43,@family_id,@member_id,'猪肉白菜包子','主食','松软鲜香，适合家庭早餐。','面粉发酵；包入猪肉白菜馅；蒸熟即可。',90,3,5,''),
(44,@family_id,@member_id,'葱油饼','主食','外酥内软，葱香浓郁。','面团擀开抹油撒葱；卷起再擀；平底锅煎熟。',30,2,3,''),
(45,@family_id,@member_id,'蛋炒饭','主食','粒粒分明的家常炒饭。','米饭打散；鸡蛋炒熟；加入米饭大火翻炒。',15,1,2,''),
(46,@family_id,@member_id,'扬州炒饭','主食','米饭松散，配料丰富。','鸡蛋炒香；加入米饭和虾仁；大火翻炒均匀。',20,2,3,''),
(47,@family_id,@member_id,'南瓜发糕','主食','松软香甜的家庭点心。','南瓜蒸熟压泥；与面粉发酵；蒸熟切块。',70,3,5,''),
(48,@family_id,@member_id,'红豆小米粥','主食','红豆绵软，小米温润。','红豆提前浸泡；与小米同煮；煮至软烂。',50,1,3,'')
ON DUPLICATE KEY UPDATE family_id=VALUES(family_id), created_by_member_id=VALUES(created_by_member_id), title=VALUES(title), category=VALUES(category), description=VALUES(description), steps=VALUES(steps), cook_minutes=VALUES(cook_minutes), difficulty=VALUES(difficulty), servings=VALUES(servings), cover_url=VALUES(cover_url), status='active';

DELETE FROM recipe_ingredients WHERE recipe_id BETWEEN 1 AND 48;
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount_grams, note) VALUES
(1,2,120,'蛋液'),(1,3,180,'去皮切块'),
(2,4,250,'切小朵'),(2,13,12,'蒜末'),
(3,6,300,'切薄片'),(3,9,150,'去虾线'),
(4,1,300,'去皮鸡胸'),(4,14,8,'腌制用'),
(5,10,300,'洗净沥水'),(5,13,10,'蒜末'),
(6,7,250,'嫩豆腐'),(6,5,80,'切片'),
(7,11,250,'切丁'),(7,12,250,'淘洗'),
(8,8,450,'整条处理'),(8,14,10,'姜片'),(8,15,15,'葱段'),
(9,17,180,'切丝'),(9,16,150,'切丝'),
(10,18,350,'切块'),(10,11,300,'切块'),
(11,20,300,'去骨切块'),(11,19,100,'切片'),
(12,9,160,'去虾线'),(12,2,150,'蛋液'),
(13,17,300,'切条'),(13,3,80,'调汁用'),
(14,21,400,'洗净划刀'),(14,14,10,'姜片'),
(15,18,180,'切片'),(15,22,180,'切段'),
(16,17,180,'切片'),(16,23,180,'切段'),
(17,24,220,'切片'),(17,15,180,'葱段'),
(18,25,400,'切块'),(18,14,10,'姜片'),
(19,20,250,'切丁'),(19,26,60,'熟花生米'),
(20,27,250,'洗净'),(20,13,10,'蒜末'),
(21,28,300,'洗净沥水'),(21,13,12,'蒜末'),
(22,19,100,'切片'),(22,29,250,'洗净'),
(23,30,350,'手撕'),(23,13,10,'蒜末'),
(24,31,350,'切段'),(24,13,10,'蒜末'),
(25,11,180,'切块'),(25,31,220,'切块'),(25,16,100,'切块'),
(26,53,350,'切片'),(26,13,10,'蒜末'),
(27,32,250,'去筋'),(27,13,10,'蒜末'),
(28,33,300,'拍碎切段'),(28,13,12,'蒜末'),
(29,34,80,'泡发'),(29,35,220,'切片'),
(30,19,100,'切片'),(30,7,300,'切块'),
(31,36,12,'泡发'),(31,2,80,'蛋液'),
(32,18,350,'切块'),(32,3,250,'切块'),
(33,38,350,'切段'),(33,37,250,'切段'),
(34,39,120,'泡发切段'),(34,7,250,'切块'),
(35,40,350,'处理干净'),(35,7,250,'切块'),
(36,41,250,'切块'),(36,42,20,'提鲜'),
(37,20,300,'去骨切块'),(37,43,180,'混合菌菇'),
(38,38,350,'切段'),(38,44,300,'切块'),
(39,12,220,'淘洗'),(39,20,150,'切丁'),(39,19,80,'切丁'),
(40,45,120,'淘洗'),(40,46,220,'切块'),
(41,12,220,'淘洗'),(41,47,70,'切丁'),(41,48,120,'切末'),
(42,49,300,'饺子皮'),(42,9,100,'虾仁'),(42,2,100,'蛋液'),
(43,52,350,'面粉'),(43,50,250,'猪肉馅'),(43,51,200,'白菜末'),
(44,52,250,'面粉'),(44,15,60,'葱花'),
(45,12,300,'隔夜米饭'),(45,2,120,'蛋液'),
(46,12,300,'隔夜米饭'),(46,9,80,'虾仁'),(46,2,100,'蛋液'),
(47,52,300,'面粉'),(47,46,220,'南瓜泥'),
(48,53,100,'提前浸泡'),(48,45,100,'淘洗');

INSERT INTO tag_definitions (kind, code, name, normalized_name)
VALUES
('system','spicy','辣','辣'),
('system','sour','酸','酸'),
('system','sweet','甜','甜'),
('system','seafood','海鲜','海鲜'),
('system','fish','鱼','鱼'),
('system','shrimp','虾','虾'),
('system','crab','蟹','蟹'),
('system','bake','烤','烤'),
('system','steam','蒸','蒸'),
('system','fried','炸','炸')
ON DUPLICATE KEY UPDATE name = VALUES(name), normalized_name = VALUES(normalized_name), status = 'active';

-- V1 only carries approved semantics. Legacy light/savory/dietary/method
-- values remain outside the new relation until a later, explicit mapping.
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT seed.recipe_id, td.id
FROM (
  SELECT 1 AS recipe_id, 'sweet' AS code UNION ALL SELECT 1, 'sour'
  UNION ALL SELECT 13, 'sweet' UNION ALL SELECT 13, 'sour'
  UNION ALL SELECT 19, 'spicy' UNION ALL SELECT 19, 'sweet'
  UNION ALL SELECT 26, 'sour'
  UNION ALL SELECT 20, 'sweet'
  UNION ALL SELECT 23, 'sweet'
  UNION ALL SELECT 27, 'sweet'
  UNION ALL SELECT 28, 'sour'
  UNION ALL SELECT 32, 'sour'
  UNION ALL SELECT 33, 'sweet'
  UNION ALL SELECT 36, 'sweet'
  UNION ALL SELECT 40, 'sweet'
  UNION ALL SELECT 47, 'sweet'
  UNION ALL SELECT 48, 'sweet'
) AS seed
INNER JOIN tag_definitions td ON td.kind = 'system' AND td.code = seed.code;

INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT seed.recipe_id, td.id
FROM (
  SELECT 8 AS recipe_id, 'fish' AS code UNION ALL SELECT 18, 'fish' UNION ALL SELECT 35, 'fish'
  UNION ALL SELECT 3, 'shrimp' UNION ALL SELECT 12, 'shrimp' UNION ALL SELECT 36, 'shrimp'
  UNION ALL SELECT 42, 'shrimp' UNION ALL SELECT 46, 'shrimp'
  UNION ALL SELECT 8, 'steam' UNION ALL SELECT 43, 'steam' UNION ALL SELECT 47, 'steam'
) AS seed
INNER JOIN tag_definitions td ON td.kind = 'system' AND td.code = seed.code;
