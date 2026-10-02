CREATE TABLE 'Reminders' (
    'id' INTEGER,
    'user' TEXT NOT NULL CHECK (trim(user) != ''),
    'end' INTEGER,
    'msg' TEXT NOT NULL CHECK (trim(msg) != ''),
    PRIMARY KEY('id' AUTOINCREMENT)
) STRICT;
---
CREATE INDEX 'idx_Reminders_user' ON 'Reminders' ('user');
---
CREATE INDEX 'idx_Reminders_end' ON 'Reminders' ('end');
