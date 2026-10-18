SELECT Tags.*, COALESCE(Usage.count, 0) AS uses
FROM Tags
LEFT JOIN Usage ON Tags.name = Usage.name
WHERE Tags.owner = $user
ORDER BY uses DESC, Tags.name ASC
LIMIT $limit;
