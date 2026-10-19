SELECT
    t.name AS targetExists,
    a.aliasName,
    a.name,
    a.body,
    a.bin,
    a.owner,
    a.args,
    a.registered,
    a.lastEdited,
    a.type
FROM Tags t
LEFT JOIN Tags a ON a.aliasName = t.name
WHERE t.name = $name
ORDER BY a.name ASC;
