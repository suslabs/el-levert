DELETE FROM Revisions
WHERE target = $target
    AND ($subjectId IS NULL OR subjectId = $subjectId)
    AND ($id IS NULL OR id = $id OR ($subjectId IS NOT NULL AND subjectIndex = $id))
    AND (
        ($fromId IS NULL AND $toId IS NULL) OR
        (
            CASE WHEN $subjectId IS NOT NULL
                THEN (
                    ($fromId IS NULL OR subjectIndex >= $fromId) AND ($toId IS NULL OR subjectIndex <= $toId)
                ) OR (
                    ($fromId IS NULL OR id >= $fromId) AND ($toId IS NULL OR id <= $toId)
                )
                ELSE ($fromId IS NULL OR id >= $fromId) AND ($toId IS NULL OR id <= $toId)
            END
        )
    )
    AND ($from IS NULL OR created >= $from)
    AND ($to IS NULL OR created <= $to);
