CREATE TABLE 'Reminders' (
    'id' INTEGER,
    'user' TEXT NOT NULL CHECK (trim(user) != ''),
    'start' INTEGER,
    'end' INTEGER DEFAULT NULL,
    'msg' TEXT DEFAULT NULL CHECK (msg IS NULL OR trim(msg) != ''),
    'interval' ANY DEFAULT NULL,
    PRIMARY KEY('id' AUTOINCREMENT)
) STRICT;
---
CREATE INDEX 'idx_Reminders_user' ON 'Reminders' ('user');
---
CREATE INDEX 'idx_Reminders_start' ON 'Reminders' ('start');
