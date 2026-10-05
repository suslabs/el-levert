INSERT INTO Revisions (target, subjectId, subjectIndex, operation, actor, created, key, changed, snapshot, revertOf, restores, reason)
VALUES (
    $target,
    $subjectId,
    COALESCE((SELECT MAX(subjectIndex) + 1 FROM Revisions WHERE target = $target AND subjectId = $subjectId), 1),
    $operation,
    $actor,
    $created,
    $key,
    $changed,
    $snapshot,
    $revertOf,
    $restores,
    $reason
);
