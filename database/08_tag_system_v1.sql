-- Keep UTF-8 metadata literals safe when mysql.exe runs with a GBK default.
SET NAMES utf8mb4;
USE mealpilot;

-- Tag System V1 converts the legacy recipe_tags metadata relation into a
-- stable tag-definition catalog plus recipe/tag association.  All statements
-- are guarded so the migration can be rerun after a partial or completed run.

CREATE TABLE IF NOT EXISTS tag_definitions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  family_id BIGINT UNSIGNED NULL,
  kind ENUM('system', 'custom') NOT NULL,
  code VARCHAR(40) NULL,
  name VARCHAR(40) NOT NULL,
  normalized_name VARCHAR(40) NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_by_member_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tag_system_code (kind, code),
  UNIQUE KEY uq_tag_family_name (family_id, normalized_name),
  KEY idx_tag_family_status (family_id, status),
  KEY idx_tag_kind_status (kind, status),
  CONSTRAINT ck_tag_definition_scope CHECK (
    (kind = 'system' AND family_id IS NULL AND code IS NOT NULL AND created_by_member_id IS NULL)
    OR
    (kind = 'custom' AND family_id IS NOT NULL AND code IS NULL AND created_by_member_id IS NOT NULL)
  ),
  CONSTRAINT fk_tag_definition_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  CONSTRAINT fk_tag_definition_creator FOREIGN KEY (created_by_member_id) REFERENCES family_members(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS recipe_tags_legacy (
  recipe_id BIGINT UNSIGNED NOT NULL,
  tag_type VARCHAR(40) NOT NULL,
  tag_value VARCHAR(40) NOT NULL,
  archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (recipe_id, tag_type, tag_value)
) ENGINE=InnoDB;

SET @tag_old_recipe_tags = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'recipe_tags'
    AND column_name = 'tag_type'
);

SET @tag_archive_sql = IF(
  @tag_old_recipe_tags = 1,
  'INSERT IGNORE INTO recipe_tags_legacy (recipe_id, tag_type, tag_value) SELECT recipe_id, tag_type, tag_value FROM recipe_tags',
  'SELECT 1'
);
PREPARE tag_stmt FROM @tag_archive_sql;
EXECUTE tag_stmt;
DEALLOCATE PREPARE tag_stmt;

SET @tag_drop_sql = IF(
  @tag_old_recipe_tags = 1,
  'DROP TABLE recipe_tags',
  'SELECT 1'
);
PREPARE tag_stmt FROM @tag_drop_sql;
EXECUTE tag_stmt;
DEALLOCATE PREPARE tag_stmt;

CREATE TABLE IF NOT EXISTS recipe_tags (
  recipe_id BIGINT UNSIGNED NOT NULL,
  tag_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (recipe_id, tag_id),
  KEY idx_recipe_tags_tag (tag_id),
  CONSTRAINT fk_recipe_tag_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  CONSTRAINT fk_recipe_tag_definition FOREIGN KEY (tag_id) REFERENCES tag_definitions(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

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

-- Only explicitly approved legacy semantics are promoted.  In particular,
-- old seafood rows remain in the archive for review and are not inferred from
-- fish/shrimp/crab mappings.
INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT legacy.recipe_id, td.id
FROM recipe_tags_legacy legacy
INNER JOIN tag_definitions td ON td.kind = 'system' AND td.code = legacy.tag_value
WHERE legacy.tag_type = 'taste'
  AND legacy.tag_value IN ('spicy', 'sour', 'sweet');

INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT legacy.recipe_id, td.id
FROM recipe_tags_legacy legacy
INNER JOIN tag_definitions td ON td.kind = 'system' AND td.code = 'steam'
WHERE legacy.tag_type = 'method' AND legacy.tag_value = 'steam';

INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT r.id, td.id
FROM recipes r
INNER JOIN tag_definitions td ON td.kind = 'system' AND td.code = 'fish'
WHERE (r.id = 8 AND r.title = '清蒸鲈鱼')
   OR (r.id = 18 AND r.title = '红烧鱼块')
   OR (r.id = 35 AND r.title = '鲫鱼豆腐汤');

INSERT IGNORE INTO recipe_tags (recipe_id, tag_id)
SELECT r.id, td.id
FROM recipes r
INNER JOIN tag_definitions td ON td.kind = 'system' AND td.code = 'shrimp'
WHERE (r.id = 3 AND r.title = '冬瓜虾仁汤')
   OR (r.id = 12 AND r.title = '虾仁炒蛋')
   OR (r.id = 36 AND r.title = '丝瓜虾皮汤')
   OR (r.id = 42 AND r.title = '三鲜水饺')
   OR (r.id = 46 AND r.title = '扬州炒饭');
