USE smart_meal;

-- Remove the obsolete cuisine classification before narrowing the controlled tag type.
DELETE FROM recipe_tags WHERE tag_type = 'cuisine';

ALTER TABLE recipe_tags
  MODIFY COLUMN tag_type ENUM('taste', 'dietary', 'method') NOT NULL;
