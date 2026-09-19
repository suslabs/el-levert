SELECT COUNT(*) AS count FROM Revisions
WHERE operation = 'revert' AND revertOf = $id;
