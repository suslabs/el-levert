SELECT name, aliasName, owner, args, registered, lastEdited, type, '' AS body, NULL AS bin FROM Tags WHERE owner = $user ORDER BY name COLLATE NOCASE ASC LIMIT $limit OFFSET $offset;

