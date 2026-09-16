USE smart_meal;

ALTER TABLE family_members
  MODIFY COLUMN role ENUM('owner', 'admin', 'member') NOT NULL DEFAULT 'member';
