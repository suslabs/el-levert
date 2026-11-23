DELETE FROM Reminders WHERE id = $id AND start = $start AND end IS $end AND interval IS $interval;
