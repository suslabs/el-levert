SELECT * FROM Revisions
WHERE target = $target AND subjectId = $subjectId
ORDER BY created DESC, id DESC
LIMIT 1;
