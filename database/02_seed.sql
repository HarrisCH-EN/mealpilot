USE smart_meal;
INSERT INTO users (openid, display_name) VALUES ('demo-owner', '演示用户') ON DUPLICATE KEY UPDATE display_name='演示用户';
SET @user_id = (SELECT id FROM users WHERE openid='demo-owner');
INSERT INTO families (name, invite_code, owner_user_id) VALUES ('示例家庭', 'MEAL26', @user_id) ON DUPLICATE KEY UPDATE name=VALUES(name);
SET @family_id = (SELECT id FROM families WHERE invite_code='MEAL26');
INSERT INTO family_members (family_id,user_id,role,nickname) VALUES (@family_id,@user_id,'owner','家人') ON DUPLICATE KEY UPDATE nickname='家人';
INSERT INTO ingredients (name,calories_per_100g,protein_per_100g,fat_per_100g,carbohydrate_per_100g) VALUES
('鸡胸肉',133,24.6,1.9,0),('鸡蛋',144,13.3,8.8,2.8),('番茄',18,0.9,0.2,3.9),('西兰花',34,2.8,0.4,6.6),('胡萝卜',41,0.9,0.2,9.6),('冬瓜',12,0.4,0.2,2.6),('豆腐',81,8.1,3.7,4.2),('鲈鱼',105,18.6,3.4,0),('虾仁',48,10.4,0.7,0),('菠菜',23,2.9,0.4,3.6),('土豆',77,2,0.1,17),('大米',346,7.4,0.8,77.9)
ON DUPLICATE KEY UPDATE calories_per_100g=VALUES(calories_per_100g);
INSERT INTO recipes (family_id,created_by_member_id,title,category,description,steps,cook_minutes,difficulty,servings) VALUES
(@family_id,(SELECT id FROM family_members WHERE family_id=@family_id LIMIT 1),'番茄炒蛋','荤菜','酸甜家常，适合全家。','鸡蛋炒熟盛出，番茄炒软后合炒。',12,1,2),
(@family_id,(SELECT id FROM family_members WHERE family_id=@family_id LIMIT 1),'蒜蓉西兰花','素菜','清爽低脂的时蔬。','西兰花焯水，蒜末爆香后翻炒。',10,1,2),
(@family_id,(SELECT id FROM family_members WHERE family_id=@family_id LIMIT 1),'冬瓜虾仁汤','汤','清淡鲜美。','冬瓜煮软，加入虾仁和调味料。',20,2,3),
(@family_id,(SELECT id FROM family_members WHERE family_id=@family_id LIMIT 1),'香煎鸡胸肉','荤菜','高蛋白快手菜。','鸡胸肉腌制后小火煎熟。',18,2,2),
(@family_id,(SELECT id FROM family_members WHERE family_id=@family_id LIMIT 1),'清炒菠菜','素菜','简单补充绿叶菜。','菠菜洗净后快速翻炒。',8,1,2),
(@family_id,(SELECT id FROM family_members WHERE family_id=@family_id LIMIT 1),'家常豆腐汤','汤','暖胃汤品。','豆腐切块与蔬菜同煮。',22,1,3),
(@family_id,(SELECT id FROM family_members WHERE family_id=@family_id LIMIT 1),'土豆焖饭','主食','一锅完成的主食。','米饭与土豆焖煮至熟。',35,2,3)
ON DUPLICATE KEY UPDATE title=VALUES(title);
