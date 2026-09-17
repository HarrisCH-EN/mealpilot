USE mealpilot;

ALTER TABLE recommendation_runs
  MODIFY COLUMN max_cook_minutes SMALLINT UNSIGNED NULL,
  MODIFY COLUMN mode ENUM('balanced', 'healthy', 'quick') NULL,
  MODIFY COLUMN total_score DECIMAL(6,2) NULL,
  MODIFY COLUMN total_cook_minutes SMALLINT UNSIGNED NULL,
  MODIFY COLUMN score_breakdown JSON NULL;
