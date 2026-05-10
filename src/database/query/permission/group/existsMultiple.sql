SELECT name FROM Groups WHERE name IN (SELECT value FROM json_each($names));
