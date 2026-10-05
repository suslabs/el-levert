DELETE FROM Revisions
WHERE target = $target
    AND ($subjectId IS NULL OR subjectId = $subjectId)
    AND ($id IS NULL OR id = $id OR ($subjectId IS NOT NULL AND subjectIndex = $id))
    AND ($fromId IS NULL OR (
        CASE WHEN $subjectId IS NOT NULL
            THEN (subjectIndex >= $fromId OR id >= $fromId)
            ELSE id >= $fromId
        END
    ))
    AND ($toId IS NULL OR (
        CASE WHEN $subjectId IS NOT NULL
            THEN (subjectIndex <= $toId OR id <= $toId)
            ELSE id <= $toId
        END
    ))
    AND ($from IS NULL OR created >= $from)
    AND ($to IS NULL OR created <= $to);
