-- up
ALTER TABLE Quotas ADD COLUMN count INTEGER;
UPDATE Quotas SET count = (
    SELECT COUNT(*)
    FROM Tags
    WHERE Tags.owner = Quotas.user
);

CREATE TABLE 'Usage' (
    'name' TEXT,
    'count' INTEGER,
    PRIMARY KEY('name')
) STRICT;

INSERT INTO Usage ('name', 'count') SELECT name, 0 FROM Tags;

CREATE TABLE 'Tags_new' (
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

INSERT INTO Tags_new ('aliasName', 'name', 'body', 'owner', 'args', 'registered', 'lastEdited', 'type')
SELECT
    CASE
        WHEN hops IS NULL OR hops = '' OR hops = name THEN NULL
        WHEN INSTR(hops, ',') = 0 THEN hops
        ELSE SUBSTR(
            SUBSTR(hops, INSTR(hops, ',') + 1),
            1,
            CASE
                WHEN INSTR(SUBSTR(hops, INSTR(hops, ',') + 1), ',') = 0
                    THEN LENGTH(SUBSTR(hops, INSTR(hops, ',') + 1))
                ELSE INSTR(SUBSTR(hops, INSTR(hops, ',') + 1), ',') - 1
            END
        )
    END,
    name,
    body,
    owner,
    args,
    registered,
    lastEdited,
    type
FROM Tags;

DROP TABLE Tags;
ALTER TABLE Tags_new RENAME TO Tags;

-- down
CREATE TABLE 'Tags_old' (
    'hops' TEXT,
    'name' TEXT,
    'body' TEXT,
    'owner' TEXT,
    'args' TEXT,
    'registered' INTEGER,
    'lastEdited' INTEGER,
    'type' INTEGER,
    PRIMARY KEY('name'),
    FOREIGN KEY('owner') REFERENCES Quotas('user')
) STRICT;

INSERT INTO Tags_old ('hops', 'name', 'body', 'owner', 'args', 'registered', 'lastEdited', 'type')
SELECT
    CASE
        WHEN aliasName IS NULL OR aliasName = '' THEN name
        ELSE name || ',' || aliasName
    END,
    name,
    body,
    owner,
    args,
    registered,
    lastEdited,
    type
FROM Tags;

DROP TABLE Tags;
DROP TABLE Usage;

CREATE TABLE 'Quotas_old' (
    'user' TEXT,
    'quota' REAL,
    PRIMARY KEY('user')
) STRICT;

INSERT INTO Quotas_old ('user', 'quota') SELECT user, quota FROM Quotas;
DROP TABLE Quotas;

ALTER TABLE Quotas_old RENAME TO Quotas;
ALTER TABLE Tags_old RENAME TO Tags;
