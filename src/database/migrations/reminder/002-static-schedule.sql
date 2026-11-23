-- up
CREATE TABLE 'Reminders_new' (
    'id' INTEGER PRIMARY KEY AUTOINCREMENT,
    'user' TEXT NOT NULL CHECK (trim(user) != ''),
    'start' INTEGER,
    'end' INTEGER DEFAULT NULL,
    'msg' TEXT DEFAULT NULL CHECK (msg IS NULL OR trim(msg) != ''),
    'interval' ANY DEFAULT NULL
) STRICT;

INSERT INTO Reminders_new ('id', 'user', 'start', 'msg', 'interval')
SELECT id, user, end, msg, interval FROM Reminders;

DROP TABLE Reminders;
ALTER TABLE Reminders_new RENAME TO Reminders;
CREATE INDEX 'idx_Reminders_user' ON 'Reminders' ('user');
CREATE INDEX 'idx_Reminders_start' ON 'Reminders' ('start');

-- down
CREATE TABLE 'Reminders_old' (
    'id' INTEGER,
    'user' TEXT NOT NULL CHECK (trim(user) != ''),
    'end' INTEGER,
    'msg' TEXT DEFAULT NULL CHECK (msg IS NULL OR trim(msg) != ''),
    'interval' ANY DEFAULT NULL,
    PRIMARY KEY('id' AUTOINCREMENT)
) STRICT;

INSERT INTO Reminders_old ('id', 'user', 'end', 'msg', 'interval')
SELECT id, user, start, msg, interval FROM Reminders;

DROP TABLE Reminders;
ALTER TABLE Reminders_old RENAME TO Reminders;

CREATE INDEX 'idx_Reminders_user' ON 'Reminders' ('user');
CREATE INDEX 'idx_Reminders_end' ON 'Reminders' ('end');
