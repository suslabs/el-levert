SELECT Tags.name, Tags.aliasName, Tags.owner, Tags.args, Tags.registered, Tags.lastEdited, Tags.type, COALESCE(Usage.count, 0) AS uses
FROM Tags
LEFT JOIN Usage ON Tags.name = Usage.name
WHERE Tags.owner = $user AND ($onlyUsed = 0 OR Usage.count > 0)
ORDER BY uses DESC, Tags.name ASC
LIMIT $limit OFFSET $offset;

