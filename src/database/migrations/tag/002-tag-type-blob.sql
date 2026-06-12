-- up
CREATE TABLE 'Tags_new' (
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

INSERT INTO Tags_new ('aliasName', 'name', 'body', 'owner', 'args', 'registered', 'lastEdited', 'type')
SELECT
    aliasName,
    name,
    body,
    owner,
    args,
    registered,
    lastEdited,
    CASE typeof(type)
        WHEN 'blob' THEN
            CASE
                WHEN length(type) = 0 THEN X'00'
                ELSE substr(type, 1, 1)
            END
        ELSE unhex(printf('%02X', coalesce(type, 0) & 255))
    END
FROM Tags;

DROP TABLE Tags;
ALTER TABLE Tags_new RENAME TO Tags;

CREATE INDEX 'idx_Tags_owner' ON 'Tags' ('owner');
CREATE INDEX 'idx_Tags_aliasName' ON 'Tags' ('aliasName');
CREATE INDEX 'idx_Tags_type' ON 'Tags' ('type');
CREATE INDEX 'idx_Tags_owner_type' ON 'Tags' ('owner', 'type');
CREATE INDEX 'idx_Quotas_quota' ON 'Quotas' ('quota');
CREATE INDEX 'idx_Quotas_count' ON 'Quotas' ('count');
CREATE INDEX 'idx_Usage_count_name' ON 'Usage' ('count', 'name');

-- down
CREATE TABLE 'Tags_old' (
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

INSERT INTO Tags_old ('aliasName', 'name', 'body', 'owner', 'args', 'registered', 'lastEdited', 'type')
SELECT
    aliasName,
    name,
    body,
    owner,
    args,
    registered,
    lastEdited,
    CASE hex(type)
        WHEN '01' THEN 1
        WHEN '02' THEN 2
        WHEN '03' THEN 3
        WHEN '04' THEN 4
        WHEN '05' THEN 5
        WHEN '06' THEN 6
        WHEN '07' THEN 7
        ELSE 0
    END
FROM Tags;

DROP TABLE Tags;
ALTER TABLE Tags_old RENAME TO Tags;
