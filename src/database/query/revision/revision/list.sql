SELECT * FROM Revisions
WHERE ($target IS NULL OR target = $target)
    AND ($subjectId IS NULL OR subjectId = $subjectId)
    AND ($actor IS NULL OR actor = $actor)
    AND ($operation IS NULL OR operation = $operation)
    AND ($from IS NULL OR created >= $from)
    AND ($to IS NULL OR created <= $to)
ORDER BY created DESC, id DESC
LIMIT $limit OFFSET $offset;
