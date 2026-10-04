CREATE TABLE 'Quotas' (
    'user' TEXT NOT NULL CHECK (trim(user) != ''),
    'quota' REAL,
    'count' INTEGER,
    PRIMARY KEY('user')
) STRICT;
---
CREATE INDEX 'idx_Quotas_quota' ON 'Quotas' ('quota');
---
CREATE INDEX 'idx_Quotas_count' ON 'Quotas' ('count');
---
CREATE TABLE 'Tags' (
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
---
CREATE INDEX 'idx_Tags_owner' ON 'Tags' ('owner');
---
CREATE INDEX 'idx_Tags_aliasName' ON 'Tags' ('aliasName');
---
CREATE INDEX 'idx_Tags_type' ON 'Tags' ('type');
---
CREATE INDEX 'idx_Tags_owner_type' ON 'Tags' ('owner', 'type');
---
CREATE TABLE 'Usage' (
    'name' TEXT NOT NULL CHECK (trim(name) != ''),
    'count' INTEGER,
    PRIMARY KEY('name')
) STRICT;
---
CREATE INDEX 'idx_Usage_count_name' ON 'Usage' ('count', 'name');
