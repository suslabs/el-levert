SELECT u.name, u.count, (t.name IS NOT NULL) AS 'exists'
FROM Usage u
LEFT JOIN Tags t ON t.name = u.name
WHERE u.count > 0
ORDER BY u.count DESC, u.name ASC
LIMIT $limit;
