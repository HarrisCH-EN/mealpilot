USE mealpilot;
SELECT category, COUNT(*) AS recipe_count, ROUND(AVG(cook_minutes),1) AS avg_minutes FROM recipes WHERE status='active' GROUP BY category;
SELECT r.title, COUNT(mi.id) AS used_count FROM recipes r LEFT JOIN menu_items mi ON mi.recipe_id=r.id GROUP BY r.id ORDER BY used_count DESC;
