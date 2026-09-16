CREATE DATABASE IF NOT EXISTS smart_meal CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE smart_meal;

CREATE TABLE users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  openid VARCHAR(64) NOT NULL,
  display_name VARCHAR(40) NOT NULL DEFAULT '微信用户',
  avatar_url VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_openid (openid)
) ENGINE=InnoDB;

CREATE TABLE families (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(40) NOT NULL,
  invite_code CHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_family_invite_code (invite_code),
  CONSTRAINT fk_family_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE family_members (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  family_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role ENUM('owner', 'admin', 'member') NOT NULL DEFAULT 'member',
  nickname VARCHAR(40) NOT NULL,
  status ENUM('active', 'left') NOT NULL DEFAULT 'active',
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_family_member (family_id, user_id),
  KEY idx_member_user_status (user_id, status),
  CONSTRAINT fk_member_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  CONSTRAINT fk_member_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE ingredients (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(60) NOT NULL,
  calories_per_100g DECIMAL(8,2) NOT NULL DEFAULT 0,
  protein_per_100g DECIMAL(8,2) NOT NULL DEFAULT 0,
  fat_per_100g DECIMAL(8,2) NOT NULL DEFAULT 0,
  carbohydrate_per_100g DECIMAL(8,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ingredient_name (name),
  CONSTRAINT ck_ingredient_nutrition CHECK (calories_per_100g >= 0 AND protein_per_100g >= 0 AND fat_per_100g >= 0 AND carbohydrate_per_100g >= 0)
) ENGINE=InnoDB;

CREATE TABLE ingredient_seasons (
  ingredient_id BIGINT UNSIGNED NOT NULL,
  month TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (ingredient_id, month),
  CONSTRAINT ck_season_month CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT fk_season_ingredient FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE recipes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  family_id BIGINT UNSIGNED NOT NULL,
  created_by_member_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(80) NOT NULL,
  category ENUM('荤菜', '素菜', '汤', '主食') NOT NULL,
  description TEXT NOT NULL,
  steps TEXT NOT NULL,
  cook_minutes SMALLINT UNSIGNED NOT NULL,
  difficulty TINYINT UNSIGNED NOT NULL,
  servings TINYINT UNSIGNED NOT NULL DEFAULT 2,
  cover_url VARCHAR(500) NOT NULL DEFAULT '',
  status ENUM('active', 'deleted') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_recipe_family_category (family_id, category, status),
  CONSTRAINT ck_recipe_minutes CHECK (cook_minutes BETWEEN 1 AND 360),
  CONSTRAINT ck_recipe_difficulty CHECK (difficulty BETWEEN 1 AND 5),
  CONSTRAINT ck_recipe_servings CHECK (servings BETWEEN 1 AND 12),
  CONSTRAINT fk_recipe_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  CONSTRAINT fk_recipe_author FOREIGN KEY (created_by_member_id) REFERENCES family_members(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE recipe_ingredients (
  recipe_id BIGINT UNSIGNED NOT NULL,
  ingredient_id BIGINT UNSIGNED NOT NULL,
  amount_grams DECIMAL(8,2) NOT NULL,
  note VARCHAR(80) NOT NULL DEFAULT '',
  PRIMARY KEY (recipe_id, ingredient_id),
  CONSTRAINT ck_recipe_ingredient_amount CHECK (amount_grams > 0),
  CONSTRAINT fk_recipe_ingredient_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  CONSTRAINT fk_recipe_ingredient_ingredient FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE tag_definitions (
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

CREATE TABLE recipe_tags_legacy (
  recipe_id BIGINT UNSIGNED NOT NULL,
  tag_type VARCHAR(40) NOT NULL,
  tag_value VARCHAR(40) NOT NULL,
  archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (recipe_id, tag_type, tag_value)
) ENGINE=InnoDB;

CREATE TABLE recipe_tags (
  recipe_id BIGINT UNSIGNED NOT NULL,
  tag_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (recipe_id, tag_id),
  KEY idx_recipe_tags_tag (tag_id),
  CONSTRAINT fk_recipe_tag_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  CONSTRAINT fk_recipe_tag_definition FOREIGN KEY (tag_id) REFERENCES tag_definitions(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE member_category_preferences (
  member_id BIGINT UNSIGNED NOT NULL,
  category ENUM('荤菜', '素菜', '汤', '主食') NOT NULL,
  preference_score TINYINT UNSIGNED NOT NULL DEFAULT 3,
  PRIMARY KEY (member_id, category),
  CONSTRAINT ck_preference_score CHECK (preference_score BETWEEN 1 AND 5),
  CONSTRAINT fk_preference_member FOREIGN KEY (member_id) REFERENCES family_members(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE member_ingredient_restrictions (
  member_id BIGINT UNSIGNED NOT NULL,
  ingredient_id BIGINT UNSIGNED NOT NULL,
  reason VARCHAR(100) NOT NULL DEFAULT '忌口',
  PRIMARY KEY (member_id, ingredient_id),
  CONSTRAINT fk_restriction_member FOREIGN KEY (member_id) REFERENCES family_members(id) ON DELETE CASCADE,
  CONSTRAINT fk_restriction_ingredient FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE recommendation_runs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  family_id BIGINT UNSIGNED NOT NULL,
  created_by_member_id BIGINT UNSIGNED NOT NULL,
  menu_date DATE NOT NULL,
  meal_type ENUM('breakfast', 'lunch', 'dinner') NOT NULL,
  people_count TINYINT UNSIGNED NOT NULL,
  max_cook_minutes SMALLINT UNSIGNED NULL,
  max_prep_minutes SMALLINT UNSIGNED NULL,
  mode ENUM('balanced', 'healthy', 'quick') NULL,
  total_score DECIMAL(6,2) NULL,
  total_cook_minutes SMALLINT UNSIGNED NULL,
  score_breakdown JSON NULL,
  menu_structure JSON NULL,
  session_preferences JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_recommendation_family_date (family_id, menu_date),
  CONSTRAINT ck_recommendation_people CHECK (people_count BETWEEN 1 AND 12),
  CONSTRAINT ck_recommendation_limit CHECK (max_cook_minutes BETWEEN 10 AND 480),
  CONSTRAINT ck_recommendation_prep_limit CHECK (max_prep_minutes IS NULL OR max_prep_minutes BETWEEN 10 AND 480),
  CONSTRAINT fk_recommendation_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  CONSTRAINT fk_recommendation_member FOREIGN KEY (created_by_member_id) REFERENCES family_members(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE recommendation_items (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  recommendation_run_id BIGINT UNSIGNED NOT NULL,
  recipe_id BIGINT UNSIGNED NOT NULL,
  dish_score DECIMAL(6,2) NOT NULL,
  reason_text VARCHAR(500) NOT NULL,
  UNIQUE KEY uq_recommendation_recipe (recommendation_run_id, recipe_id),
  CONSTRAINT fk_recommendation_item_run FOREIGN KEY (recommendation_run_id) REFERENCES recommendation_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE recommendation_candidates (
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

CREATE TABLE recommendation_candidate_items (
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

CREATE TABLE menus (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  family_id BIGINT UNSIGNED NOT NULL,
  created_by_member_id BIGINT UNSIGNED NOT NULL,
  recommendation_run_id BIGINT UNSIGNED NULL,
  menu_date DATE NOT NULL,
  meal_type ENUM('breakfast', 'lunch', 'dinner') NOT NULL,
  status ENUM('active', 'completed') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_menu_slot (family_id, menu_date, meal_type),
  CONSTRAINT fk_menu_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  CONSTRAINT fk_menu_member FOREIGN KEY (created_by_member_id) REFERENCES family_members(id) ON DELETE RESTRICT,
  CONSTRAINT fk_menu_recommendation FOREIGN KEY (recommendation_run_id) REFERENCES recommendation_runs(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE menu_items (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  menu_id BIGINT UNSIGNED NOT NULL,
  recipe_id BIGINT UNSIGNED NOT NULL,
  source ENUM('manual', 'recommendation') NOT NULL DEFAULT 'manual',
  note VARCHAR(200) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_menu_recipe (menu_id, recipe_id),
  CONSTRAINT fk_menu_item_menu FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE menu_feedback (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  menu_item_id BIGINT UNSIGNED NOT NULL,
  member_id BIGINT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment VARCHAR(200) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_feedback_member_item (menu_item_id, member_id),
  CONSTRAINT ck_feedback_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT fk_feedback_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_feedback_member FOREIGN KEY (member_id) REFERENCES family_members(id) ON DELETE CASCADE
) ENGINE=InnoDB;
