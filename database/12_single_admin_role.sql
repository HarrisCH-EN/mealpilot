ALTER TABLE families
  DROP FOREIGN KEY fk_family_owner,
  DROP KEY idx_family_recovery,
  CHANGE COLUMN owner_user_id admin_user_id BIGINT UNSIGNED NULL,
  ADD KEY idx_family_recovery (admin_user_id, status, purge_after);

UPDATE family_members
SET role = 'admin'
WHERE role = 'owner';

UPDATE families f
JOIN family_members fm
  ON fm.family_id = f.id
 AND fm.role = 'admin'
 AND fm.status = 'active'
SET f.admin_user_id = fm.user_id
WHERE f.status = 'active';

ALTER TABLE family_members
  MODIFY COLUMN role ENUM('admin', 'member') NOT NULL DEFAULT 'member';

ALTER TABLE families
  ADD CONSTRAINT fk_family_admin FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE SET NULL;
