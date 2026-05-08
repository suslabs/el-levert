CREATE TABLE 'Quotas' (
    'user' TEXT,
    'quota' REAL,
    PRIMARY KEY('user')
) STRICT;
---
CREATE TABLE 'Tags' (
    'aliasName' TEXT DEFAULT NULL,
    'name' TEXT,
    'body' TEXT,
    'owner' TEXT,
    'args' TEXT DEFAULT NULL,
    'registered' INTEGER,
    'lastEdited' INTEGER,
    'type' INTEGER,
    PRIMARY KEY('name'),
    FOREIGN KEY('owner') REFERENCES Quotas('user')
) STRICT;
