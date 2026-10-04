-- up
CREATE TABLE 'Tags_new' (
    'aliasName' TEXT DEFAULT NULL CHECK (aliasName IS NULL OR trim(aliasName) != ''),
    'name' TEXT NOT NULL CHECK (trim(name) != ''),
    'body' TEXT,
    'bin' BLOB DEFAULT NULL,
    'owner' TEXT NOT NULL CHECK (trim(owner) != ''),
    'args' TEXT DEFAULT NULL,
    'registered' INTEGER,
    'lastEdited' INTEGER,
    'type' BLOB NOT NULL DEFAULT X'00',
    PRIMARY KEY('name'),
    FOREIGN KEY('owner') REFERENCES Quotas('user')
) STRICT;

INSERT INTO Tags_new ('aliasName', 'name', 'body', 'bin', 'owner', 'args', 'registered', 'lastEdited', 'type')
SELECT
    aliasName,
    name,
    body,
    NULL,
    owner,
    args,
    registered,
    lastEdited,
    type
FROM Tags;

DROP TABLE Tags;
ALTER TABLE Tags_new RENAME TO Tags;

CREATE INDEX 'idx_Tags_owner' ON 'Tags' ('owner');
CREATE INDEX 'idx_Tags_aliasName' ON 'Tags' ('aliasName');
CREATE INDEX 'idx_Tags_type' ON 'Tags' ('type');
CREATE INDEX 'idx_Tags_owner_type' ON 'Tags' ('owner', 'type');

-- down
CREATE TABLE 'Tags_old' (
    'aliasName' TEXT DEFAULT NULL CHECK (aliasName IS NULL OR trim(aliasName) != ''),
    'name' TEXT NOT NULL CHECK (trim(name) != ''),
    'body' TEXT,
    'owner' TEXT NOT NULL CHECK (trim(owner) != ''),
    'args' TEXT DEFAULT NULL,
    'registered' INTEGER,
    'lastEdited' INTEGER,
    'type' BLOB NOT NULL DEFAULT X'00',
    PRIMARY KEY('name'),
    FOREIGN KEY('owner') REFERENCES Quotas('user')
) STRICT;

INSERT INTO Tags_old ('aliasName', 'name', 'body', 'owner', 'args', 'registered', 'lastEdited', 'type')
SELECT
    aliasName,
    name,
    body,
    owner,
    args,
    registered,
    lastEdited,
    type
FROM Tags;

DROP TABLE Tags;
ALTER TABLE Tags_old RENAME TO Tags;

CREATE INDEX 'idx_Tags_owner' ON 'Tags' ('owner');
CREATE INDEX 'idx_Tags_aliasName' ON 'Tags' ('aliasName');
CREATE INDEX 'idx_Tags_type' ON 'Tags' ('type');
CREATE INDEX 'idx_Tags_owner_type' ON 'Tags' ('owner', 'type');
