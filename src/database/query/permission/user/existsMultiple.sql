SELECT DISTINCT user FROM Users WHERE user IN (SELECT value FROM json_each($users));
