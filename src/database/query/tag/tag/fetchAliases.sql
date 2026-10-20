WITH RECURSIVE AliasTree AS (
    SELECT a.*, 1 AS depth, '/' || a.name || '/' AS path
    FROM Tags a
    WHERE a.aliasName = $name

    UNION ALL

    SELECT child.*, parent.depth + 1, parent.path || child.name || '/'
    FROM Tags child
    JOIN AliasTree parent ON child.aliasName = parent.name
    WHERE instr(parent.path, '/' || child.name || '/') = 0
        AND (parent.args IS NULL OR trim(parent.args) = '')
)
SELECT DISTINCT
    t.name AS targetExists,
    tree.aliasName, tree.name, tree.body, tree.bin, tree.owner, tree.args,
    tree.registered, tree.lastEdited, tree.type
FROM (
    SELECT name FROM Tags WHERE name = $name
    UNION ALL
    SELECT $name AS name WHERE $targetExists = 1
    LIMIT 1
) t
LEFT JOIN AliasTree tree ON 1 = 1
ORDER BY tree.name ASC;
