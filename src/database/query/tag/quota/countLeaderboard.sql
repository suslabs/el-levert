SELECT user, count FROM Quotas WHERE count > 0 ORDER BY count DESC LIMIT $limit;
