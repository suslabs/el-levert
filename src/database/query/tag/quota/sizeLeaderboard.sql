SELECT user, quota FROM Quotas WHERE quota > 0 ORDER BY quota DESC LIMIT $limit;