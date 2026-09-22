ALTER TABLE families
  DROP FOREIGN KEY fk_family_owner;

ALTER TABLE families
  MODIFY COLUMN owner_user_id BIGINT UNSIGNED NULL,
  ADD COLUMN status ENUM('active', 'archived') NOT NULL DEFAULT 'active' AFTER owner_user_id,
  ADD COLUMN disbanded_at DATETIME NULL AFTER status,
  ADD COLUMN purge_after DATETIME NULL AFTER disbanded_at,
  ADD KEY idx_family_recovery (owner_user_id, status, purge_after),
  ADD KEY idx_family_purge (status, purge_after);

ALTER TABLE families
  ADD CONSTRAINT fk_family_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE family_members
  DROP FOREIGN KEY fk_member_user;

ALTER TABLE family_members
  MODIFY COLUMN user_id BIGINT UNSIGNED NULL;

ALTER TABLE family_members
  ADD CONSTRAINT fk_member_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS storage_cleanup_jobs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  file_id VARCHAR(500) NOT NULL,
  kind ENUM('avatar', 'family_recipe') NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_storage_cleanup_file (file_id),
  KEY idx_storage_cleanup_due (next_attempt_at)
) ENGINE=InnoDB;
