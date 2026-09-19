-- up
CREATE TABLE IF NOT EXISTS 'RevisionSubjects' (
    'id' INTEGER PRIMARY KEY AUTOINCREMENT,
    'target' TEXT NOT NULL,
    'key' TEXT NOT NULL,
    'staticSnapshot' TEXT NOT NULL DEFAULT '{}',
    'active' INTEGER NOT NULL DEFAULT 1,
    'deleted' INTEGER DEFAULT NULL,
    'created' INTEGER NOT NULL
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS 'idx_RevisionSubjects_active_key' ON 'RevisionSubjects' ('target', 'key') WHERE active = 1;
CREATE INDEX IF NOT EXISTS 'idx_RevisionSubjects_target_active' ON 'RevisionSubjects' ('target', 'active');

CREATE TABLE IF NOT EXISTS 'Revisions' (
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

CREATE INDEX IF NOT EXISTS 'idx_Revisions_target_created' ON 'Revisions' ('target', 'created');
CREATE INDEX IF NOT EXISTS 'idx_Revisions_subject_created' ON 'Revisions' ('subjectId', 'created');
CREATE INDEX IF NOT EXISTS 'idx_Revisions_actor_created' ON 'Revisions' ('actor', 'created');
CREATE INDEX IF NOT EXISTS 'idx_Revisions_key' ON 'Revisions' ('target', 'key');
CREATE INDEX IF NOT EXISTS 'idx_Revisions_revertOf' ON 'Revisions' ('revertOf');

-- down
DROP TABLE IF EXISTS Revisions;
DROP TABLE IF EXISTS RevisionSubjects;
