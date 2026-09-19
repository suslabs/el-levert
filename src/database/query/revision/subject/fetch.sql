SELECT * FROM RevisionSubjects
WHERE target = $target AND key = $key AND active = 1
LIMIT 1;
