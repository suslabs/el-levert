SELECT * FROM Revisions
WHERE target = $target AND subjectId = $subjectId
    AND (created < $created OR (created = $created AND id < $id))
ORDER BY created DESC, id DESC
LIMIT 1;
