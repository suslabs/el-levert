SELECT name, body FROM Tags WHERE aliasName IS NULL AND type IN (SELECT unhex(value) FROM json_each($types));
