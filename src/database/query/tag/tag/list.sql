SELECT name, aliasName, owner, args, registered, lastEdited, type, '' AS body, NULL AS bin FROM Tags WHERE owner = $user;
