-- up
CREATE TABLE 'Users_new' (
    'id' INTEGER,
    'user' TEXT,
    'group' TEXT,
    PRIMARY KEY('id' AUTOINCREMENT),
    UNIQUE('user', 'group'),
    FOREIGN KEY('group') REFERENCES Groups('name') ON UPDATE CASCADE ON DELETE CASCADE
) STRICT;

INSERT INTO Users_new ('id', 'user', 'group')
SELECT MIN(Users.id), Users.user, Users."group"
FROM Users
INNER JOIN Groups ON Groups.name = Users."group"
WHERE Users.user IS NOT NULL
GROUP BY Users.user, Users."group";

DROP TABLE Users;
ALTER TABLE Users_new RENAME TO Users;
CREATE INDEX 'idx_Users_user_group' ON 'Users' ('user', 'group');
CREATE INDEX 'idx_Users_group' ON 'Users' ('group');

-- down
CREATE TABLE 'Users_old' (
    'id' INTEGER,
    'user' TEXT,
    'group' TEXT,
    PRIMARY KEY('id' AUTOINCREMENT),
    FOREIGN KEY('group') REFERENCES Groups('name')
) STRICT;

INSERT INTO Users_old ('id', 'user', 'group')
SELECT Users.id, Users.user, Users."group"
FROM Users
INNER JOIN Groups ON Groups.name = Users."group"
WHERE Users.user IS NOT NULL;

DROP TABLE Users;
ALTER TABLE Users_old RENAME TO Users;
CREATE INDEX 'idx_Users_user_group' ON 'Users' ('user', 'group');
CREATE INDEX 'idx_Users_group' ON 'Users' ('group');
