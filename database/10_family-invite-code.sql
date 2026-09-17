USE mealpilot;

-- Invite codes are six ASCII alphanumeric characters and must remain
-- case-sensitive so codes that differ only by letter case are distinct.
-- The guard makes this migration safe to rerun; the runtime preflight uses
-- the same checks when the backend starts from an older database.
SET @family_invite_code_upgrade = (
  SELECT IF(
    LOWER(COLUMN_TYPE) = 'char(6)'
      AND CHARACTER_SET_NAME = 'ascii'
      AND COLLATION_NAME = 'ascii_bin',
    'SELECT 1',
    'ALTER TABLE families MODIFY COLUMN invite_code CHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'families'
    AND column_name = 'invite_code'
);
PREPARE family_invite_code_stmt FROM @family_invite_code_upgrade;
EXECUTE family_invite_code_stmt;
DEALLOCATE PREPARE family_invite_code_stmt;
