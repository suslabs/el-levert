SELECT name, type FROM Tags WHERE type IN (SELECT unhex(value) FROM json_each($types)) ORDER BY name COLLATE NOCASE ASC;
