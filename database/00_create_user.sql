CREATE DATABASE IF NOT EXISTS mealpilot CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'mealpilot_app'@'localhost' IDENTIFIED BY 'replace_with_local_database_password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON mealpilot.* TO 'mealpilot_app'@'localhost';
FLUSH PRIVILEGES;
