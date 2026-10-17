-- up
ALTER TABLE Reminders ADD COLUMN 'interval' INTEGER DEFAULT NULL;

-- down
CREATE TABLE 'Reminders_old' (
    'id' INTEGER,
    'user' TEXT NOT NULL CHECK (trim(user) != ''),
    'end' INTEGER,
    'msg' TEXT NOT NULL CHECK (trim(msg) != ''),
    PRIMARY KEY('id' AUTOINCREMENT)
) STRICT;

INSERT INTO Reminders_old ('id', 'user', 'end', 'msg')
SELECT id, user, end, msg FROM Reminders;

DROP TABLE Reminders;
ALTER TABLE Reminders_old RENAME TO Reminders;

CREATE INDEX 'idx_Reminders_user' ON 'Reminders' ('user');
CREATE INDEX 'idx_Reminders_end' ON 'Reminders' ('end');
