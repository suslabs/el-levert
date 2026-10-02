DELETE FROM Revisions
WHERE target = $target
    AND ($subjectId IS NULL OR subjectId = $subjectId)
    AND ($id IS NULL OR id = $id)
    AND ($fromId IS NULL OR id >= $fromId)
    AND ($toId IS NULL OR id <= $toId)
    AND ($from IS NULL OR created >= $from)
    AND ($to IS NULL OR created <= $to);
