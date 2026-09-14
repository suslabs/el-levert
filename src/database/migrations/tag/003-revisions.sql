-- up
CREATE TABLE 'RevisionSubjects' (
    'id' INTEGER PRIMARY KEY AUTOINCREMENT,
    'target' TEXT NOT NULL,
    'key' TEXT NOT NULL,
    'staticSnapshot' TEXT NOT NULL DEFAULT '{}',
    'active' INTEGER NOT NULL DEFAULT 1,
    'deleted' INTEGER DEFAULT NULL,
    'created' INTEGER NOT NULL
) STRICT;

CREATE UNIQUE INDEX 'idx_RevisionSubjects_active_key' ON 'RevisionSubjects' ('target', 'key') WHERE active = 1;
CREATE INDEX 'idx_RevisionSubjects_target_active' ON 'RevisionSubjects' ('target', 'active');

CREATE TABLE 'Revisions' (
    'id' INTEGER PRIMARY KEY AUTOINCREMENT,
    'target' TEXT NOT NULL,
    'subjectId' INTEGER NOT NULL,
    'operation' TEXT NOT NULL,
    'actor' TEXT DEFAULT NULL,
    'created' INTEGER NOT NULL,
    'key' TEXT NOT NULL,
    'changed' TEXT NOT NULL DEFAULT '[]',
    'snapshot' TEXT DEFAULT NULL,
    'revertOf' INTEGER DEFAULT NULL,
    'restores' INTEGER DEFAULT NULL,
    'reason' TEXT DEFAULT NULL,
    FOREIGN KEY('subjectId') REFERENCES RevisionSubjects('id')
) STRICT;

CREATE INDEX 'idx_Revisions_target_created' ON 'Revisions' ('target', 'created');
CREATE INDEX 'idx_Revisions_subject_created' ON 'Revisions' ('subjectId', 'created');
CREATE INDEX 'idx_Revisions_actor_created' ON 'Revisions' ('actor', 'created');
CREATE INDEX 'idx_Revisions_key' ON 'Revisions' ('target', 'key');
CREATE INDEX 'idx_Revisions_revertOf' ON 'Revisions' ('revertOf');

INSERT INTO RevisionSubjects ('target', 'key', 'staticSnapshot', 'active', 'deleted', 'created')
SELECT
    'tag',
    json_object('name', name),
    json_object('registered', registered),
    1,
    NULL,
    registered
FROM Tags;

INSERT INTO Revisions ('target', 'subjectId', 'operation', 'actor', 'created', 'key', 'changed', 'snapshot', 'revertOf', 'restores', 'reason')
SELECT
    'tag',
    RevisionSubjects.id,
    'import',
    NULL,
    Tags.registered,
    json_object('name', Tags.name),
    json_array('aliasName', 'name', 'body', 'owner', 'args', 'type'),
    json_object(
        'aliasName', Tags.aliasName,
        'name', Tags.name,
        'body', Tags.body,
        'owner', Tags.owner,
        'args', Tags.args,
        'type', hex(Tags.type)
    ),
    NULL,
    NULL,
    NULL
FROM Tags
JOIN RevisionSubjects ON RevisionSubjects.target = 'tag' AND RevisionSubjects.key = json_object('name', Tags.name);

-- down
DROP TABLE Revisions;
DROP TABLE RevisionSubjects;
