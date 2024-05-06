WITH RECURSIVE t_info(name, hops, sub) AS (
    SELECT
        name, hops,
        SUBSTR(hops, INSTR(hops, $sep || $name) +
        LENGTH($sep || $name)) AS sub
    FROM Tags 
    WHERE
        hops LIKE '%' || $sep || $name || '%'
        AND (sub = '' OR sub LIKE $sep || '%')
),
split(name, seq, word, str) AS (
    SELECT
        name, -1, $sep,
        hops || $sep
    FROM t_info
    UNION ALL 
    SELECT
        name, seq + 1,
        SUBSTR(str, 0, INSTR(str, $sep)),
        SUBSTR(str, INSTR(str, $sep) + 1)
    FROM split
    WHERE str != ''
),
joined(name, str) AS (
    SELECT
        name,
        GROUP_CONCAT(
            CASE
                WHEN word = $name THEN $newName
                ELSE word
            END,
            $sep
        ) as concat
    FROM split
    WHERE split.seq >= 0
    GROUP BY name
    ORDER BY split.seq ASC
)
UPDATE Tags
    SET hops = (
        SELECT str
        FROM joined
        WHERE Tags.name = name
    )
    WHERE name IN (
        SELECT name
        FROM joined
    );