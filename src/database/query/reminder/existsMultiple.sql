SELECT DISTINCT user FROM Reminders WHERE user IN (SELECT value FROM json_each($users));
