SELECT * FROM Tags WHERE type IN (SELECT unhex(value) FROM json_each($types));
