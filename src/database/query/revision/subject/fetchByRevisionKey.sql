SELECT RevisionSubjects.*
FROM RevisionSubjects
INNER JOIN Revisions ON Revisions.subjectId = RevisionSubjects.id
WHERE RevisionSubjects.target = $target AND Revisions.key = $key
ORDER BY Revisions.created DESC, Revisions.id DESC
LIMIT 1;
