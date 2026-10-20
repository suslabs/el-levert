SELECT name FROM Tags WHERE type IN (SELECT unhex(value) FROM json_each($types)) ORDER BY RANDOM() LIMIT 1;
