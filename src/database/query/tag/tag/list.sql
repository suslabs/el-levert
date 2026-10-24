SELECT name, aliasName, owner, args, registered, lastEdited, type, '' AS body, NULL AS bin FROM Tags WHERE owner = $user AND type IN (SELECT unhex(value) FROM json_each($types)) ORDER BY name COLLATE NOCASE ASC LIMIT $limit OFFSET $offset;

