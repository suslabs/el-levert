WITH RECURSIVE AliasChain AS (
    SELECT *, 1 AS depth, '/' || name || '/' AS path
    FROM Tags
    WHERE name = $name

    UNION ALL

    SELECT t.*, c.depth + 1, c.path || t.name || '/'
    FROM Tags t
    JOIN AliasChain c ON t.name = c.aliasName
    WHERE instr(c.path, '/' || t.name || '/') = 0
)
SELECT
    name, aliasName, body, bin, owner, args, registered, lastEdited, type,
    GROUP_CONCAT(NULLIF(args, ''), $separator) OVER () AS collectedArgs
FROM AliasChain
ORDER BY depth ASC;

