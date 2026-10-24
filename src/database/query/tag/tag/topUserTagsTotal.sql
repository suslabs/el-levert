SELECT COUNT(*) AS count
FROM Tags
LEFT JOIN Usage ON Tags.name = Usage.name
WHERE Tags.owner = $user AND ($onlyUsed = 0 OR Usage.count > 0);
