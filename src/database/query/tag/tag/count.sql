SELECT COUNT(*) AS count FROM Tags WHERE ($user IS NULL OR owner = $user) AND type IN (SELECT unhex(value) FROM json_each($types));
