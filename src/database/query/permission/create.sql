CREATE TABLE 'Groups' (
    'name' TEXT,
    'level' INTEGER,
    PRIMARY KEY('name')
) STRICT;
---
CREATE INDEX 'idx_Groups_level' ON 'Groups' ('level');
---
CREATE TABLE 'Users' (
    'id' INTEGER,
    'user' TEXT,
    'group' TEXT,
    PRIMARY KEY('id' AUTOINCREMENT),
    UNIQUE('user', 'group'),
    FOREIGN KEY('group') REFERENCES Groups('name') ON UPDATE CASCADE ON DELETE CASCADE
) STRICT;
---
CREATE INDEX 'idx_Users_user_group' ON 'Users' ('user', 'group');
---
CREATE INDEX 'idx_Users_group' ON 'Users' ('group');
