SELECT name FROM Tags WHERE name IN (SELECT value FROM json_each($names));
