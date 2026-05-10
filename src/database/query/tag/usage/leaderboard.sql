SELECT name, count FROM Usage WHERE count > 0 ORDER BY count DESC, name ASC LIMIT $limit;
