-- up
ALTER TABLE 'Revisions' ADD COLUMN 'subjectIndex' INTEGER NOT NULL DEFAULT 1;

WITH Ranked AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY target, subjectId ORDER BY created ASC, id ASC) AS rnk
    FROM Revisions
)
UPDATE Revisions
SET subjectIndex = (SELECT rnk FROM Ranked WHERE Ranked.id = Revisions.id);

CREATE INDEX IF NOT EXISTS 'idx_Revisions_subject_index' ON 'Revisions' ('target', 'subjectId', 'subjectIndex');

-- down
DROP INDEX IF EXISTS idx_Revisions_subject_index;
ALTER TABLE Revisions DROP COLUMN subjectIndex;
