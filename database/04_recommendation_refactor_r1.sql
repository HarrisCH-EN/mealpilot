USE mealpilot;

-- MySQL 8.0.45 does not support the conditional ADD COLUMN form.  Build each
-- ALTER statement only when its column is absent so this upgrade is safe to
-- re-run on an already upgraded database.
SET @r1_add_max_prep_minutes = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE recommendation_runs ADD COLUMN max_prep_minutes SMALLINT UNSIGNED NULL AFTER max_cook_minutes, ADD CONSTRAINT ck_recommendation_prep_limit CHECK (max_prep_minutes IS NULL OR max_prep_minutes BETWEEN 10 AND 480)',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'recommendation_runs'
    AND column_name = 'max_prep_minutes'
);
PREPARE r1_stmt FROM @r1_add_max_prep_minutes;
EXECUTE r1_stmt;
DEALLOCATE PREPARE r1_stmt;

SET @r1_add_menu_structure = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE recommendation_runs ADD COLUMN menu_structure JSON NULL AFTER score_breakdown',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'recommendation_runs'
    AND column_name = 'menu_structure'
);
PREPARE r1_stmt FROM @r1_add_menu_structure;
EXECUTE r1_stmt;
DEALLOCATE PREPARE r1_stmt;

SET @r1_add_session_preferences = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE recommendation_runs ADD COLUMN session_preferences JSON NULL AFTER menu_structure',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'recommendation_runs'
    AND column_name = 'session_preferences'
);
PREPARE r1_stmt FROM @r1_add_session_preferences;
EXECUTE r1_stmt;
DEALLOCATE PREPARE r1_stmt;

CREATE TABLE IF NOT EXISTS recipe_tags (
  recipe_id BIGINT UNSIGNED NOT NULL,
  tag_type ENUM('taste', 'dietary', 'method') NOT NULL,
  tag_value VARCHAR(40) NOT NULL,
  PRIMARY KEY (recipe_id, tag_type, tag_value),
  KEY idx_recipe_tags_type_value (tag_type, tag_value),
  CONSTRAINT fk_recipe_tag_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS recommendation_candidates (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  recommendation_run_id BIGINT UNSIGNED NOT NULL,
  candidate_rank TINYINT UNSIGNED NOT NULL,
  estimated_prep_minutes SMALLINT UNSIGNED NOT NULL,
  total_score DECIMAL(6,2) NOT NULL,
  score_breakdown JSON NOT NULL,
  reason_text VARCHAR(500) NOT NULL DEFAULT '',
  UNIQUE KEY uq_recommendation_candidate_rank (recommendation_run_id, candidate_rank),
  CONSTRAINT ck_candidate_rank CHECK (candidate_rank BETWEEN 1 AND 3),
  CONSTRAINT fk_candidate_run FOREIGN KEY (recommendation_run_id) REFERENCES recommendation_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS recommendation_candidate_items (
  recommendation_candidate_id BIGINT UNSIGNED NOT NULL,
  recipe_id BIGINT UNSIGNED NOT NULL,
  slot_no TINYINT UNSIGNED NOT NULL,
  category ENUM('荤菜', '素菜', '汤', '主食') NOT NULL,
  dish_score DECIMAL(6,2) NOT NULL,
  reason_text VARCHAR(500) NOT NULL DEFAULT '',
  PRIMARY KEY (recommendation_candidate_id, recipe_id),
  UNIQUE KEY uq_candidate_item_slot (recommendation_candidate_id, slot_no),
  CONSTRAINT ck_candidate_item_slot CHECK (slot_no >= 1),
  CONSTRAINT fk_candidate_item_candidate FOREIGN KEY (recommendation_candidate_id) REFERENCES recommendation_candidates(id) ON DELETE CASCADE,
  CONSTRAINT fk_candidate_item_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
