SELECT * FROM Reminders WHERE user = $user ORDER BY end ASC LIMIT $limit OFFSET $offset;

