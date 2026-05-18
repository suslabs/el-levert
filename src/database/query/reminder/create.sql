CREATE TABLE 'Reminders' (
    'id' INTEGER,
    'user' TEXT,
    'end' INTEGER,
    'msg' TEXT,
    PRIMARY KEY('id' AUTOINCREMENT)
) STRICT;
---
CREATE INDEX 'idx_Reminders_user' ON 'Reminders' ('user');
---
CREATE INDEX 'idx_Reminders_end' ON 'Reminders' ('end');
