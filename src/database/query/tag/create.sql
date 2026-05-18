CREATE TABLE 'Quotas' (
    'user' TEXT,
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
    'aliasName' TEXT DEFAULT NULL,
    'name' TEXT,
    'body' TEXT,
    'owner' TEXT,
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
CREATE INDEX 'idx_Tags_type' ON 'Tags' (blob_to_int(type));
---
CREATE INDEX 'idx_Tags_owner_type' ON 'Tags' ('owner', blob_to_int(type));
---
CREATE TABLE 'Usage' (
    'name' TEXT,
    'count' INTEGER,
    PRIMARY KEY('name')
) STRICT;
---
CREATE INDEX 'idx_Usage_count_name' ON 'Usage' ('count', 'name');
