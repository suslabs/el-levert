SELECT * FROM RevisionSubjects WHERE target = $target AND key = $key AND active = 0 ORDER BY id DESC LIMIT 1;
